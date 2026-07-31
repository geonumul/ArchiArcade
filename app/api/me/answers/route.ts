import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, ACCESS_COOKIE } from "@/lib/auth";
import { BANK_SIZE } from "@/lib/game/bank";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내 응답 기록과 프로필 카드.
 *
 * 전역 집계(Vote, archbal-bank-v4)는 누가 골랐는지를 남기지 않는다. 그래야 사람들이
 * 눈치 보지 않고 누르고, 그 숫자가 쓸 만해진다. 대신 그 익명성 때문에 "너는 몇 번이나
 * 소수파였나" 를 그쪽에서는 절대 만들 수 없다. 그래서 가입한 사람에게 돌려줄 몫은
 * 본인 소유의 별도 기록(AnswerLog)에서 만든다. 두 데이터는 서로를 모른다.
 *
 * 소수파 판정은 저장할 때가 아니라 읽을 때 계산한다. 전역 비율은 계속 움직이므로
 * 답한 순간의 판정을 굳혀 두면 시간이 갈수록 화면의 숫자가 실제와 어긋난다.
 *
 *   POST /api/me/answers  { answers: [{ idx, choice }, ...] }  로그인 필요
 *   GET  /api/me/answers                                       로그인 필요
 */

/// 전역 집계가 사는 곳. /api/bank 가 늘리고 여기서는 읽기만 한다.
const KEY = "archbal-bank-v4";

/// 한 요청에 받는 최대 개수. 한 판이 30문항이라 두 판치를 한 번에 보내도 들어간다.
const MAX_ANSWERS = 60;

const CHOICES = ["a", "b"] as const;
type Choice = (typeof CHOICES)[number];

async function whoami() {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims) return null;
  // 이 라우트가 다루는 것은 전부 본인 것이라 필요한 값은 id 뿐이다.
  return { id: claims.sub };
}

function needLogin() {
  return NextResponse.json(
    { error: "로그인하면 내 기록을 볼 수 있어요", needLogin: true },
    { status: 401 }
  );
}

/**
 * 전역 집계를 읽어 { [문항번호]: { a, b } } 로 돌려준다.
 *
 * Kv.value 는 JSON 자체가 아니라 JSON 문자열이다(원본 SPA 의 저장 형식 그대로).
 * 집계가 아직 없거나 값이 깨져 있어도 화면은 떠야 하므로 빈 객체로 떨어뜨린다 -
 * 그러면 소수파 수가 0 으로 나올 뿐, 프로필이 통째로 실패하지는 않는다.
 */
type Tally = Record<string, { a: number; b: number }>;

function parseTally(raw: string | null | undefined): Tally {
  if (!raw) return {};
  try {
    const all = JSON.parse(raw) as Record<string, { a?: unknown; b?: unknown }>;
    const out: Tally = {};
    for (const [k, v] of Object.entries(all ?? {})) {
      if (!v || typeof v !== "object") continue;
      out[k] = { a: Number(v.a) || 0, b: Number(v.b) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) return needLogin();

  /* 한 판이 끝나는 순간 30문항이 한꺼번에 올라올 수도, 문항마다 한 번씩 올라올 수도
     있다. 게임을 끝까지 한 사람이 마지막 몇 문항에서 막히면 기록이 반쪽이 되므로
     연달아 여러 판을 해도 걸리지 않을 만큼 넉넉히 연다. */
  const rl = await rateLimit(`answers:${me.id}`, 240, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const list = body.answers;
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "answers 배열이 필요해요" }, { status: 400 });
  }
  if (list.length > MAX_ANSWERS) {
    return NextResponse.json({ error: `한 번에 ${MAX_ANSWERS}개까지만 보낼 수 있어요` }, { status: 400 });
  }

  /* 같은 문항이 한 요청 안에 두 번 들어오면 나중 것만 남긴다. 어차피 표의 기본키가
     (userId, questionIdx) 라 결과는 같지만, 미리 걷어 내면 쓸데없는 왕복이 줄고
     아래 트랜잭션이 같은 줄을 두 번 건드리는 일도 없어진다. */
  const picked = new Map<number, Choice>();
  for (const raw of list as { idx?: unknown; choice?: unknown }[]) {
    const idx = Number(raw?.idx);
    const choice = String(raw?.choice);
    if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE) {
      return NextResponse.json({ error: "잘못된 문항" }, { status: 400 });
    }
    if (!(CHOICES as readonly string[]).includes(choice)) {
      return NextResponse.json({ error: "잘못된 선택" }, { status: 400 });
    }
    picked.set(idx, choice as Choice);
  }

  if (picked.size === 0) return NextResponse.json({ ok: true, saved: 0 });

  const prisma = db();
  await prisma.$transaction(
    [...picked].map(([questionIdx, choice]) =>
      prisma.answerLog.upsert({
        where: { userId_questionIdx: { userId: me.id, questionIdx } },
        create: { userId: me.id, questionIdx, choice },
        update: { choice },
      })
    )
  );

  return NextResponse.json({ ok: true, saved: picked.size });
}

export async function GET() {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) return needLogin();

  const prisma = db();
  const [rows, kv] = await Promise.all([
    prisma.answerLog.findMany({
      where: { userId: me.id },
      select: { questionIdx: true, choice: true },
    }),
    prisma.kv.findUnique({ where: { key: KEY } }),
  ]);

  const tally = parseTally(kv?.value);

  let minority = 0;
  let rarest: { idx: number; choice: string; share: number } | null = null;

  for (const row of rows) {
    const entry = tally[String(row.questionIdx)];
    const total = (entry?.a ?? 0) + (entry?.b ?? 0);
    /* 아직 아무도 답하지 않은 문항은 건너뛴다. 표가 0 이면 내가 다수인지 소수인지
       알 수 없는 것이지 소수인 것이 아니다 - 여기서 세면 새 문항이 추가될 때마다
       모두의 소수파 수가 근거 없이 올라간다. */
    if (total <= 0) continue;

    const mine = row.choice === "a" ? (entry?.a ?? 0) : (entry?.b ?? 0);
    const share = mine / total;
    if (share < 0.5) minority += 1;
    if (!rarest || share < rarest.share) {
      rarest = { idx: row.questionIdx, choice: row.choice, share };
    }
  }

  const answered = rows.length;

  return NextResponse.json({
    answered,
    minority,
    // 답한 게 없을 때 0 으로 나누지 않는다. 갓 가입한 사람이 프로필을 여는 흔한 경우다.
    contrarian: answered > 0 ? minority / answered : 0,
    rarest,
  });
}
