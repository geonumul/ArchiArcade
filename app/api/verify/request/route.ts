import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { resolveSchool, isMajor } from "@/lib/school";
import { sendVerificationCode, MAIL_ENABLED } from "@/lib/mailer";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MIN = 10;

function makeCode(): string {
  // 6자리 숫자. 앞자리가 0이어도 되도록 문자열로 다룬다.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "인증 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  let body: { email?: unknown; major?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const major = typeof body.major === "string" ? body.major : "";

  if (!isMajor(major)) {
    return NextResponse.json({ error: "학과를 선택해주세요" }, { status: 400 });
  }

  const school = resolveSchool(email);
  if (!school) {
    return NextResponse.json(
      { error: "학교 메일이 아니에요. 학교에서 받은 주소로 시도해주세요", unknownDomain: true },
      { status: 400 }
    );
  }

  // 남의 주소로 메일을 쏟아붓지 못하게 두 축으로 막는다.
  const perEmail = await rateLimit(`verify:mail:${email}`, 3, 600);
  if (!perEmail.allowed) {
    return NextResponse.json(
      { error: "이 주소로는 잠시 후 다시 시도할 수 있어요" },
      { status: 429, headers: { "retry-after": String(perEmail.retryAfterSec) } }
    );
  }
  const perIp = await rateLimit(`verify:ip:${ip}`, 10, 600);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많아요" },
      { status: 429, headers: { "retry-after": String(perIp.retryAfterSec) } }
    );
  }

  const code = makeCode();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

  const prisma = db();
  await prisma.verifyCode.upsert({
    where: { email },
    create: { email, codeHash, expiresAt },
    update: { codeHash, expiresAt, attempts: 0 },
  });

  const mail = await sendVerificationCode(email, code, school.name);

  return NextResponse.json({
    ok: true,
    school: { name: school.name, country: school.country },
    mailSent: mail.sent,
    // 메일 발송이 꺼진 개발 환경에서만 코드를 돌려준다. 키가 있으면 절대 노출하지 않는다.
    devCode: MAIL_ENABLED ? undefined : mail.devCode,
    expiresInMin: CODE_TTL_MIN,
  });
}
