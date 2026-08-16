import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { signAccess, signRefresh, cookieOptions, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { resolveSchool } from "@/lib/school";
import { rateLimit, ipKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

/**
 * 가입 2단계 — 코드가 맞으면 그제서야 계정을 만든다.
 *
 * 이름·비밀번호·언어는 1단계(/api/auth/register)에서 받아 둔 값을 그대로 쓴다.
 * 여기서 다시 입력받지 않는 이유는, 코드 확인 화면에서 비밀번호를 또 받으면
 * 그 사이 값이 달라질 여지가 생기기 때문이다 — 1단계에서 확정한 값이 그대로
 * 계정이 된다.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "회원 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`registerc:ip:${ipKey(ip)}`, 20, 600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 많아요" }, { status: 429 });
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const prisma = db();
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) {
    return NextResponse.json({ error: "인증 코드를 다시 요청해주세요" }, { status: 400 });
  }
  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);
    return NextResponse.json({ error: "코드가 만료됐어요. 다시 요청해주세요" }, { status: 400 });
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "시도 횟수를 넘었어요. 다시 요청해주세요" }, { status: 429 });
  }

  const given = crypto.createHash("sha256").update(code).digest("hex");
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(pending.codeHash, "hex");
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    await prisma.pendingRegistration.update({ where: { email }, data: { attempts: { increment: 1 } } });
    return NextResponse.json(
      { error: `코드가 달라요 (${pending.attempts + 1}/${MAX_ATTEMPTS})` },
      { status: 400 }
    );
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        pwHash: pending.pwHash,
        locale: pending.locale,
        // 코드가 이 메일로 도착했다는 것이 곧 소유 확인이다.
        emailVerifiedAt: new Date(),
        profile: { create: {} },
        ...(pending.marketing ? { marketing: { create: { agreed: true } } } : {}),
      },
    });
  } catch {
    // 코드를 기다리는 사이 이름이나 이메일이 다른 계정에 먼저 쓰였다.
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);
    return NextResponse.json(
      { error: "그 사이 닉네임이나 이메일이 이미 쓰였어요. 처음부터 다시 시도해주세요" },
      { status: 409 }
    );
  }

  // 성공했으면 대기 줄은 즉시 지운다 — 재사용을 막는다.
  await prisma.pendingRegistration.delete({ where: { email } }).catch(() => undefined);

  const claims = { sub: user.id, name: user.name, gen: 0 };
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await signAccess(claims), cookieOptions.access);
  jar.set(REFRESH_COOKIE, await signRefresh(claims), cookieOptions.refresh);

  // 학교 메일인지만 알려 준다. 실제 뱃지는 /api/verify 로 소유를 확인한 뒤에 나간다.
  const school = resolveSchool(user.email!);

  return NextResponse.json({
    user: { name: user.name, email: user.email, locale: user.locale, plays: 0, minorPicks: 0, verified: false },
    schoolEmail: school ? { name: school.name, country: school.country } : null,
  });
}
