import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { hashPassword, validName, validPassword, signAccess, signRefresh, cookieOptions, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "회원 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`register:${ip}`, 5, 600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  let body: { name?: unknown; pw?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const pw = typeof body.pw === "string" ? body.pw : "";
  const locale = typeof body.locale === "string" && isLang(body.locale) ? body.locale : "ko";

  if (!validName(name)) return NextResponse.json({ error: "닉네임을 확인해주세요" }, { status: 400 });
  if (name.toLowerCase() === "admin") return NextResponse.json({ error: "사용할 수 없는 이름이에요" }, { status: 400 });
  if (!validPassword(pw)) return NextResponse.json({ error: "비밀번호는 8자 이상, 영문+숫자 포함" }, { status: 400 });

  const prisma = db();
  if (await prisma.user.findUnique({ where: { name } })) {
    return NextResponse.json({ error: "이미 있는 닉네임이에요" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { name, pwHash: await hashPassword(pw), locale, profile: { create: {} } },
    include: { profile: true },
  });

  const claims = { sub: user.id, name: user.name, gen: 0 };
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await signAccess(claims), cookieOptions.access);
  jar.set(REFRESH_COOKIE, await signRefresh(claims), cookieOptions.refresh);

  return NextResponse.json({ user: { name: user.name, locale: user.locale, plays: 0, minorPicks: 0 } });
}
