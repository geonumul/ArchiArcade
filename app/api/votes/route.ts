import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store } from "@/lib/store";
import { BANK_SIZE, isLocalVariant } from "@/lib/game/bank";
import { isLang } from "@/lib/i18n";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { readBadge, BADGE_COOKIE } from "@/lib/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 전세계 익명 합산. 문항 idx 가 9개 언어의 공통 키이므로 언어를 함께 남겨
/// "국가별 인식 비교" 리포트를 나중에 뽑을 수 있게 한다.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`vote:${ipKey(ip)}`, 120, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "too many" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  let body: { idx?: unknown; choice?: unknown; lang?: unknown; roomCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const idx = Number(body.idx);
  const choice = body.choice === "a" || body.choice === "b" ? body.choice : null;
  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE || !choice || !lang) {
    return NextResponse.json({ error: "잘못된 값" }, { status: 400 });
  }

  // 인증된 학생이면 학교를 함께 새긴다. 학교별 순위와, 데이터 상품에서
  // "검증된 건축학도 응답"만 따로 집계하기 위한 근거가 여기서 만들어진다.
  // 뱃지가 없으면 익명 표로 남고, 그래도 전역 집계에는 그대로 포함된다.
  const jar = await cookies();
  const badge = await readBadge(jar.get(BADGE_COOKIE)?.value);

  await store().addVote({
    questionIdx: idx,
    choice,
    lang,
    roomCode: typeof body.roomCode === "string" ? body.roomCode : null,
    schoolDomain: badge?.schoolDomain ?? null,
    major: badge?.major ?? null,
  });

  const tally = await store().tallyVotes(idx);
  return NextResponse.json({ ...tally, localVariant: isLocalVariant(idx) });
}

/// 특정 문항의 전역 집계.
export async function GET(req: Request) {
  const idx = Number(new URL(req.url).searchParams.get("idx"));
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE) {
    return NextResponse.json({ error: "잘못된 idx" }, { status: 400 });
  }
  const tally = await store().tallyVotes(idx);
  return NextResponse.json({ idx, ...tally, localVariant: isLocalVariant(idx) });
}
