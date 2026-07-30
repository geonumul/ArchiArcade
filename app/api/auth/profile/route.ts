import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 한 판 끝났을 때 전적을 올린다.
 *
 * 원본은 전적을 회원 레코드에 담아 공용 저장소에 통째로 다시 썼다. 그러면 남이
 * 내 전적을 덮어쓸 수 있고, 같은 레코드에 비밀번호 해시가 들어 있어 그것까지
 * 누구나 읽을 수 있었다. 이제 로그인 쿠키로 본인을 확인하고 서버가 더한다.
 *
 *   POST /api/auth/profile  { minor }  →  { plays, minorPicks }
 *     · plays 는 항상 1 증가한다 — 한 번 호출이 한 판이다
 *     · minor 는 그 판에서 소수 의견을 고른 횟수
 */
export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({ user: null }, { status: 503 });

  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  // 한 판은 최소 몇 분이 걸린다. 이보다 잦으면 전적을 부풀리는 호출이다.
  const rl = await rateLimit(`profile:${claims.sub}`, 20, 600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "너무 잦은 요청이에요" }, { status: 429 });
  }

  let minor = 0;
  try {
    const body = (await req.json()) as { minor?: unknown };
    const n = Number(body.minor);
    // 한 판의 문항 수 상한(30)을 넘는 값은 받지 않는다.
    if (Number.isInteger(n) && n >= 0 && n <= 30) minor = n;
  } catch {
    /* 본문이 없으면 판 수만 올린다 */
  }

  const prisma = db();
  const profile = await prisma.profile
    .upsert({
      where: { userId: claims.sub },
      create: { userId: claims.sub, plays: 1, minorPicks: minor },
      update: { plays: { increment: 1 }, minorPicks: { increment: minor } },
    })
    .catch(() => null);

  if (!profile) return NextResponse.json({ error: "계정을 찾지 못했어요" }, { status: 404 });

  return NextResponse.json({ plays: profile.plays, minorPicks: profile.minorPicks });
}
