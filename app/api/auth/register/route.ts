import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { hashPassword, isAdminName, validName, validPassword } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { normalizeEmail, validEmail } from "@/lib/email";
import { sendRegisterCode, MAIL_ENABLED } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MIN = 10;

/// 학교 인증·비밀번호 재설정과 같은 규칙 — 코드는 개발 환경에서만 화면에 보여 준다.
const IS_PROD = process.env.NODE_ENV === "production";
const CAN_SHOW_CODE = !IS_PROD && !MAIL_ENABLED;

function makeCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * 가입 1단계 — 정보를 받아 메일로 인증 코드를 보낸다.
 *
 * 계정은 아직 만들지 않는다. 예전에는 여기서 바로 User 를 만들고 로그인까지
 * 시켰는데, 그러면 이메일 형식만 맞으면 남의 주소나 오타 난 주소로도 가입이
 * 그대로 끝나 버렸다 — 가입 이메일은 비밀번호를 잊었을 때의 유일한 복구
 * 통로인데(아래 확정 라우트 참고) 정작 그 주소를 받는지 한 번도 확인하지
 * 않은 셈이다. 이제 코드를 보내고, 그 코드가 맞을 때만
 * /api/auth/register/confirm 이 계정을 만든다.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "회원 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  // 메일을 보낼 수 없으면 가입 자체를 닫는다. 코드 확인을 우회할 길을 만드느니
  // 잠시 닫혀 있는 편이 낫다 — 학교 인증·비밀번호 재설정과 같은 원칙.
  if (IS_PROD && !MAIL_ENABLED) {
    return NextResponse.json(
      { error: "회원가입은 메일 발송 준비가 끝나면 열립니다. 조금만 기다려주세요", mailNotReady: true },
      { status: 503 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`register:${ipKey(ip)}`, 5, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { name?: unknown; email?: unknown; pw?: unknown; locale?: unknown; marketing?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const pw = typeof body.pw === "string" ? body.pw : "";
  const locale = typeof body.locale === "string" && isLang(body.locale) ? body.locale : "ko";
  const marketing = body.marketing === true;

  if (!validName(name)) return NextResponse.json({ error: "닉네임을 확인해주세요", field: "name" }, { status: 400 });
  // 관리자 이름은 가입으로 만들 수 없다. 이름만 알면 누구나 선점할 수 있기 때문이고,
  // 그 계정은 scripts/create-admin.mjs 로만 만든다.
  if (name.toLowerCase() === "admin" || isAdminName(name)) {
    return NextResponse.json({ error: "사용할 수 없는 이름이에요", field: "name" }, { status: 400 });
  }
  if (!validEmail(email)) {
    return NextResponse.json({ error: "이메일 형식을 확인해주세요", field: "email" }, { status: 400 });
  }
  if (!validPassword(pw)) {
    return NextResponse.json({ error: "비밀번호는 8자 이상, 영문+숫자 포함", field: "pw" }, { status: 400 });
  }

  const prisma = db();
  if (await prisma.user.findUnique({ where: { name } })) {
    return NextResponse.json({ error: "이미 있는 닉네임이에요", field: "name" }, { status: 409 });
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "이미 가입된 이메일이에요", field: "email" }, { status: 409 });
  }

  // 같은 주소로 재요청이 잦으면 스팸이나 무차별 대입 시도다.
  const perEmail = await rateLimit(`register:mail:${email}`, 3, 600);
  if (!perEmail.allowed) {
    return NextResponse.json(
      { error: "이 주소로는 잠시 후 다시 시도할 수 있어요" },
      { status: 429, headers: { "retry-after": String(perEmail.retryAfterSec) } }
    );
  }

  const code = makeCode();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
  const pwHash = await hashPassword(pw);

  await prisma.pendingRegistration.upsert({
    where: { email },
    create: { email, name, pwHash, locale, marketing, codeHash, expiresAt },
    update: { name, pwHash, locale, marketing, codeHash, expiresAt, attempts: 0 },
  });

  const mail = await sendRegisterCode(email, code, name);

  // 보낼 수 있어야 하는데 실패했다면 그대로 알린다 — "보냈다"고 해놓고 오지 않으면
  // 스팸함만 뒤지다 포기한다.
  if (MAIL_ENABLED && !mail.sent) {
    return NextResponse.json(
      { error: "지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해주세요", mailFailed: true },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    needCode: true,
    expiresInMin: CODE_TTL_MIN,
    // 로컬 개발에서만 코드를 돌려준다. 프로덕션은 위에서 이미 막혀 여기 닿지 않는다.
    devCode: CAN_SHOW_CODE ? mail.devCode : undefined,
  });
}
