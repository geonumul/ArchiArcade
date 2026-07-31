import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { sendPasswordResetCode, MAIL_ENABLED } from "@/lib/mailer";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { normalizeEmail, validEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MIN = 10;

/// 학교 인증과 같은 규칙 — 코드는 개발 환경에서만 화면에 보여 준다.
const IS_PROD = process.env.NODE_ENV === "production";
const CAN_SHOW_CODE = !IS_PROD && !MAIL_ENABLED;

function makeCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * 비밀번호 재설정 코드 요청.
 *
 * 가입된 주소인지 여부를 응답으로 흘리지 않는다. 알려 주면 그것만으로 회원 목록을
 * 훑어볼 수 있기 때문이다. 그래서 없는 주소에도 성공처럼 답하고 메일만 보내지 않는다.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }
  if (IS_PROD && !MAIL_ENABLED) {
    return NextResponse.json(
      { error: "비밀번호 찾기는 메일 발송 준비가 끝나면 열립니다", mailNotReady: true },
      { status: 503 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!validEmail(email)) {
    return NextResponse.json({ error: "이메일 형식을 확인해주세요" }, { status: 400 });
  }

  const perEmail = await rateLimit(`reset:mail:${email}`, 3, 600);
  if (!perEmail.allowed) {
    return NextResponse.json(
      { error: "이 주소로는 잠시 후 다시 시도할 수 있어요" },
      { status: 429, headers: { "retry-after": String(perEmail.retryAfterSec) } }
    );
  }
  const perIp = await rateLimit(`reset:ip:${ipKey(ip)}`, 10, 600);
  if (!perIp.allowed) {
    return NextResponse.json({ error: "요청이 너무 많아요" }, { status: 429 });
  }

  const prisma = db();
  const user = await prisma.user.findUnique({ where: { email } });

  // 가입되지 않은 주소 — 있는 것처럼 답하고 아무것도 보내지 않는다.
  if (!user) {
    return NextResponse.json({ ok: true, expiresInMin: CODE_TTL_MIN });
  }

  const code = makeCode();
  await prisma.passwordReset.upsert({
    where: { email },
    create: {
      email,
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
    },
    update: {
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
      attempts: 0,
    },
  });

  const mail = await sendPasswordResetCode(email, code, user.name);
  if (MAIL_ENABLED && !mail.sent) {
    return NextResponse.json(
      { error: "지금은 메일을 보낼 수 없어요. 잠시 후 다시 시도해주세요" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    expiresInMin: CODE_TTL_MIN,
    devCode: CAN_SHOW_CODE ? mail.devCode : undefined,
  });
}
