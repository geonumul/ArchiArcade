import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { resolveSchool, isMajor } from "@/lib/school";
import { sendVerificationCode, MAIL_ENABLED } from "@/lib/mailer";
import { rateLimit, ipKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MIN = 10;

/**
 * 코드를 화면에 띄우는 것은 개발 환경에서만 허용한다.
 *
 * 이 판단을 MAIL_ENABLED(=RESEND_API_KEY 유무)에만 맡기면, 키를 넣지 않은 채 배포한
 * 순간 인증이 무의미해진다. 아무나 남의 학교 주소를 적고 화면에 뜬 번호를 그대로
 * 입력해 그 학교 뱃지를 받을 수 있기 때문이다 — 실제로 그 상태로 배포돼 있었다.
 */
const IS_PROD = process.env.NODE_ENV === "production";
const CAN_SHOW_CODE = !IS_PROD && !MAIL_ENABLED;

function makeCode(): string {
  // 6자리 숫자. 앞자리가 0이어도 되도록 문자열로 다룬다.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "인증 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  // 메일을 보낼 수 없는 프로덕션에서는 인증을 아예 닫는다. 코드를 화면에 띄워
  // 우회시키는 것보다, 기능이 잠시 닫혀 있는 편이 낫다.
  if (IS_PROD && !MAIL_ENABLED) {
    return NextResponse.json(
      { error: "학교 인증은 메일 발송 준비가 끝나면 열립니다. 조금만 기다려주세요", mailNotReady: true },
      { status: 503 }
    );
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
  const perIp = await rateLimit(`verify:ip:${ipKey(ip)}`, 10, 600);
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

  // 보낼 수 있어야 하는데 실패했다면 그대로 알린다. "보냈다"고 해놓고 오지 않으면
  // 사용자는 스팸함만 뒤지다 포기한다 — 발송 도메인 인증 전에는 실제로 이 상태가 된다.
  if (MAIL_ENABLED && !mail.sent) {
    return NextResponse.json(
      { error: "지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해주세요", mailFailed: true },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    school: { name: school.name, country: school.country },
    mailSent: mail.sent,
    // 로컬 개발에서만 코드를 돌려준다. 프로덕션은 위에서 이미 막혀 여기 닿지 않는다.
    devCode: CAN_SHOW_CODE ? mail.devCode : undefined,
    expiresInMin: CODE_TTL_MIN,
  });
}
