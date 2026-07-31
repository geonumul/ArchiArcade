import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 커뮤니티 카드 관심 등록.
 *
 * 어느 언어권이 어떤 기능을 원하는지 세는 데이터다. 무엇을 먼저 만들지 정하는 근거라
 * 지워지면 다시 모을 방법이 없다.
 *
 * 예전에는 브라우저가 전체 값을 읽어 한 칸 고쳐 통째로 되썼다. 두 사람이 동시에
 * 누르면 한쪽이 사라지고, 요청 하나로 전부 날릴 수도 있었다. 이제 늘리는 일만
 * 서버가 하고 저장소 쪽 쓰기는 막았다.
 *
 *   GET  /api/interest              → { counts: { [기능]: 합계 } }
 *   POST /api/interest { feature, lang }  → { count }  해당 기능의 갱신된 합계
 *
 * 저장 위치와 형식은 원본 그대로다({ 기능: { 언어: 수 } }). 화면이 읽는 경로가
 * 그대로 동작해야 하기 때문이다.
 */

const KEY = "arcade-interest-v1";
/// 허브에 있는 커뮤니티 카드 네 개. 그 밖의 값은 받지 않는다.
const FEATURES = ["team", "crit", "res", "match"] as const;

type Counts = Record<string, Record<string, number>>;

async function read(): Promise<Counts> {
  if (!prisma) return {};
  const row = await prisma.kv.findUnique({ where: { key: KEY } });
  if (!row) return {};
  try {
    const v = JSON.parse(row.value);
    return v && typeof v === "object" ? (v as Counts) : {};
  } catch {
    return {};
  }
}

function totals(counts: Counts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [feature, byLang] of Object.entries(counts)) {
    out[feature] = Object.values(byLang ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);
  }
  return out;
}

export async function GET() {
  if (!hasDatabase) return NextResponse.json({ counts: {} });
  const counts = await read();
  return NextResponse.json({ counts: totals(counts), byLang: counts });
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) {
    return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 한 사람이 네 개를 다 눌러도 넉넉하되, 눌러서 숫자를 부풀리기는 어렵게.
  const rl = await rateLimit(`interest:${ip}`, 12, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { feature?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const feature = (FEATURES as readonly string[]).includes(String(body.feature)) ? String(body.feature) : null;
  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";
  if (!feature) return NextResponse.json({ error: "알 수 없는 기능" }, { status: 400 });

  /* 읽고-더하고-쓰기라 두 요청이 겹치면 한쪽이 사라질 수 있다. 관심 등록은 드물게
     일어나고 한 번 어긋나도 판단이 바뀌지 않는 종류의 숫자라, 여기서는 트랜잭션까지
     걸지 않는다. 표가 사라지면 안 되는 투표 집계는 /api/bank 에서 한 문장으로 늘린다. */
  const counts = await read();
  counts[feature] = counts[feature] ?? {};
  counts[feature][lang] = (Number(counts[feature][lang]) || 0) + 1;

  await prisma.kv.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(counts) },
    update: { value: JSON.stringify(counts) },
  });

  return NextResponse.json({ ok: true, feature, count: totals(counts)[feature] ?? 0 });
}
