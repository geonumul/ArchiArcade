import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { LANGS } from "@/lib/i18n";
import { BANK_SIZE } from "@/lib/game/bank";
import { isInquiryKind, toSponsorLang } from "@/lib/i18n/sponsor";
import { sendSponsorInquiry } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 스폰서·제휴 창구.
 *
 *   GET  /api/sponsor/inquiry  → 공개해도 되는 숫자 넷
 *   POST /api/sponsor/inquiry  → 문의 접수(저장 후 운영자에게 메일)
 *
 * ── 무엇을 공개하고 무엇을 감추나 ──
 *
 * 누적 투표와 플레이만 내보낸다. 플레이 수는 이미 허브의 COIN/PLAYS 카운터로 떠 있어
 * 새로 드러나는 것이 아니고, 둘 다 줄어들지 않는 숫자라 초기에도 부끄럽지 않다.
 *
 * 월 방문자와 유입 경로(VisitStat)는 여기로 내보내지 않는다. 그 숫자가 곧 단가라
 * 페이지에 박아 두면 협상 여지가 없어지고, 한번 공개되면 캡처되고 색인돼 되돌릴 수
 * 없다. 문의한 상대에게 메일로 보내면 항상 최신이고 상대에 맞춰 조절할 수 있다.
 *
 * 나라 수는 뺐다. 나라 정보는 Report.country - 게시판에 글을 쓴 소수에게만 있는
 * 값이라, 그것으로 "도달 국가" 를 말하면 사실과 다른 숫자가 된다.
 */

const STATS_KEY = "arcade-stats-v1";

interface Metrics {
  votes: number;
  plays: number;
  langs: number;
  questions: number;
}

/**
 * 숫자 넷을 5분 동안 재사용한다.
 *
 * Vote 는 한 판에 수십 줄씩 쌓이는 표라 COUNT(*) 가 전부 훑는다. 이 페이지는 사람이
 * 거의 안 들어오지만, 크롤러 하나가 붙으면 그 훑기가 계속 돌게 된다. 스폰서에게
 * 보여 주는 숫자가 5분 낡아도 아무 일도 일어나지 않는다.
 */
let cache: { at: number; value: Metrics } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function metrics(): Promise<Metrics> {
  const base = { langs: LANGS.length, questions: BANK_SIZE };
  if (!hasDatabase || !prisma) return { votes: 0, plays: 0, ...base };

  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  // 숫자를 못 읽는다고 페이지가 안 뜨면 안 된다. 문의 폼이 이 페이지의 본체다.
  const [votes, playsRow] = await Promise.all([
    prisma.vote.count().catch(() => 0),
    prisma.kv.findUnique({ where: { key: STATS_KEY } }).catch(() => null),
  ]);

  let plays = 0;
  try {
    plays = Number(JSON.parse(playsRow?.value || "{}").plays) || 0;
  } catch {
    /* 값이 깨져 있으면 0 으로 둔다 */
  }

  const value: Metrics = { votes, plays, ...base };
  cache = { at: Date.now(), value };
  return value;
}

export async function GET() {
  return NextResponse.json(await metrics());
}

/// 문의 본문 길이 상한. 길어서 막을 일은 없지만, 메일 한 통에 담기지 않을 만큼은 아니어야 한다.
const MAX = { org: 80, contact: 40, email: 120, message: 2000 };

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) {
    return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  /* 진짜 문의는 하루에 몇 건도 안 온다. 한 시간에 세 번이면 오타를 고쳐 다시 보내기에는
     넉넉하고, 폼을 자동으로 두드리는 쪽에는 좁다. */
  const rl = await rateLimit(`sponsor:${ipKey(ip)}`, 3, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const org = clean(body.org, MAX.org);
  const contact = clean(body.contact, MAX.contact);
  const email = clean(body.email, MAX.email);
  const message = clean(body.message, MAX.message);
  const kind = isInquiryKind(body.kind) ? body.kind : "other";
  const lang = toSponsorLang(body.lang);

  if (!org) return NextResponse.json({ error: "org", field: "org" }, { status: 400 });
  // 주소가 틀리면 답을 보낼 수 없으므로, 여기만 형태를 본다.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "email", field: "email" }, { status: 400 });
  }
  if (message.length < 10) return NextResponse.json({ error: "message", field: "message" }, { status: 400 });

  /* 저장이 먼저, 발송이 나중이다. 메일이 실패해도 줄은 남아 나중에 찾아갈 수 있다.
     반대 순서였다면 Resend 가 죽어 있는 동안 들어온 문의는 흔적도 없이 사라진다. */
  const row = await prisma.sponsorInquiry.create({
    data: { org, contact, email, kind, message, lang },
  });

  const to = process.env.SPONSOR_INQUIRY_EMAIL;
  if (to) {
    const mailed = await sendSponsorInquiry(to, { org, contact, email, kind, message });
    if (mailed) {
      await prisma.sponsorInquiry.update({ where: { id: row.id }, data: { mailed: true } }).catch(() => null);
    } else {
      console.error(`[sponsor] 메일 발송 실패 — 문의는 저장됨 id=${row.id}`);
    }
  } else {
    console.warn(`[sponsor] SPONSOR_INQUIRY_EMAIL 미설정 — 문의는 저장됨 id=${row.id}`);
  }

  /* 접수는 됐으므로 메일이 나갔는지와 무관하게 성공으로 답한다. 여기서 실패를 알리면
     사용자는 접수가 안 된 줄 알고 같은 문의를 다시 보낸다. */
  return NextResponse.json({ ok: true });
}
