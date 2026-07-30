import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { verifyPassword, signAccess, signRefresh, cookieOptions, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { rateLimit, resetLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 로그인 5회 실패 시 60초 잠금(docs/DEV_HANDOFF.md STEP 2).
const MAX_FAILS = 5;
const LOCK_SEC = 60;

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "회원 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  let body: { name?: unknown; pw?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const pw = typeof body.pw === "string" ? body.pw : "";
  if (!name || !pw) return NextResponse.json({ error: "입력을 확인해주세요" }, { status: 400 });

  const key = `login:${name.toLowerCase()}`;
  const rl = await rateLimit(key, MAX_FAILS, LOCK_SEC);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `로그인 시도가 많아 ${rl.retryAfterSec}초 후에 다시 시도할 수 있어요` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  const prisma = db();
  const user = await prisma.user.findUnique({ where: { name } });
  // 존재하지 않는 계정과 비밀번호 불일치를 같은 응답으로 처리해 계정 존재 여부를 흘리지 않는다.
  if (!user) return NextResponse.json({ error: "닉네임 또는 비밀번호가 달라요" }, { status: 401 });

  const { ok, upgradedHash } = await verifyPassword(pw, user.pwHash);
  if (!ok) return NextResponse.json({ error: "닉네임 또는 비밀번호가 달라요" }, { status: 401 });

  // 레거시 PBKDF2 계정은 최초 로그인 성공 시 argon2id 로 조용히 승급시킨다.
  if (upgradedHash) {
    await prisma.user.update({ where: { id: user.id }, data: { pwHash: upgradedHash } }).catch(() => undefined);
  }

  await resetLimit(key);

  const claims = { sub: user.id, name: user.name, gen: 0 };
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await signAccess(claims), cookieOptions.access);
  jar.set(REFRESH_COOKIE, await signRefresh(claims), cookieOptions.refresh);

  const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    user: {
      name: user.name,
      email: user.email,
      verified: Boolean(user.emailVerifiedAt),
      locale: user.locale,
      plays: profile?.plays ?? 0,
      minorPicks: profile?.minorPicks ?? 0,
    },
    upgraded: Boolean(upgradedHash),
  });
}
