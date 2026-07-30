import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { hashPassword, validPassword } from "@/lib/auth";
import { rateLimit, resetLimit } from "@/lib/ratelimit";
import { normalizeEmail, validEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

/**
 * 코드 확인 후 새 비밀번호로 교체.
 *
 * 성공하면 코드를 즉시 폐기한다. 로그인 잠금 카운터도 함께 비운다 — 잊어버려서
 * 여러 번 틀린 뒤 재설정한 사람이 정작 새 비밀번호로 못 들어가는 일을 막는다.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`resetc:ip:${ip}`, 20, 600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 많아요" }, { status: 429 });
  }

  let body: { email?: unknown; code?: unknown; pw?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const pw = typeof body.pw === "string" ? body.pw : "";

  if (!validEmail(email)) {
    return NextResponse.json({ error: "이메일 형식을 확인해주세요" }, { status: 400 });
  }
  if (!validPassword(pw)) {
    return NextResponse.json({ error: "비밀번호는 8자 이상, 영문+숫자 포함", field: "pw" }, { status: 400 });
  }

  const prisma = db();
  const row = await prisma.passwordReset.findUnique({ where: { email } });
  if (!row) {
    return NextResponse.json({ error: "코드를 다시 요청해주세요" }, { status: 400 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.passwordReset.delete({ where: { email } }).catch(() => undefined);
    return NextResponse.json({ error: "코드가 만료됐어요. 다시 요청해주세요" }, { status: 400 });
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "시도 횟수를 넘었어요. 다시 요청해주세요" }, { status: 429 });
  }

  const given = crypto.createHash("sha256").update(code).digest("hex");
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(row.codeHash, "hex");
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    await prisma.passwordReset.update({ where: { email }, data: { attempts: { increment: 1 } } });
    return NextResponse.json(
      { error: `코드가 달라요 (${row.attempts + 1}/${MAX_ATTEMPTS})` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // 코드가 발급된 뒤 계정이 사라진 경우. 코드는 폐기한다.
    await prisma.passwordReset.delete({ where: { email } }).catch(() => undefined);
    return NextResponse.json({ error: "계정을 찾지 못했어요" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    // 코드가 메일로 도착했다는 것은 그 주소를 실제로 받는다는 뜻이다.
    data: { pwHash: await hashPassword(pw), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  await prisma.passwordReset.delete({ where: { email } }).catch(() => undefined);
  await resetLimit(`login:${user.name.toLowerCase()}`);

  return NextResponse.json({ ok: true, name: user.name });
}
