import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import {
  hashPassword,
  isAdminName,
  validName,
  validPassword,
  signAccess,
  signRefresh,
  cookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { normalizeEmail, validEmail } from "@/lib/email";
import { resolveSchool } from "@/lib/school";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 가입 — 닉네임 · 이메일 · 비밀번호.
 *
 * 이메일을 필수로 받는 이유는 하나다. 이것이 없으면 비밀번호를 잊은 계정을 되돌릴
 * 방법이 전혀 없다(원본은 닉네임과 비밀번호만 받아서 정말로 복구가 불가능했다).
 *
 * 가입 자체는 메일 확인을 기다리지 않고 바로 끝낸다. 메일 발송이 막혀 있어도
 * 게임은 계속 돌아가야 하기 때문이다. 학교 메일로 가입했다면 그 사실을 응답에
 * 실어 보내, 화면이 곧바로 학교 인증으로 이어 줄 수 있게 한다.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "회원 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`register:${ip}`, 5, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { name?: unknown; email?: unknown; pw?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const pw = typeof body.pw === "string" ? body.pw : "";
  const locale = typeof body.locale === "string" && isLang(body.locale) ? body.locale : "ko";

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

  const user = await prisma.user.create({
    data: { name, email, pwHash: await hashPassword(pw), locale, profile: { create: {} } },
  });

  const claims = { sub: user.id, name: user.name, gen: 0 };
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await signAccess(claims), cookieOptions.access);
  jar.set(REFRESH_COOKIE, await signRefresh(claims), cookieOptions.refresh);

  // 학교 메일인지만 알려 준다. 실제 뱃지는 /api/verify 로 소유를 확인한 뒤에 나간다
  // — 여기서 바로 발급하면 남의 주소를 적은 사람에게도 뱃지가 가버린다.
  const school = resolveSchool(email);

  return NextResponse.json({
    user: { name: user.name, email: user.email, locale: user.locale, plays: 0, minorPicks: 0, verified: false },
    schoolEmail: school ? { name: school.name, country: school.country } : null,
  });
}
