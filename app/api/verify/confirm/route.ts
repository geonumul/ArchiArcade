import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { hasDatabase, db } from "@/lib/db";
import { resolveSchool, isMajor } from "@/lib/school";
import { signBadge, badgeCookieOptions, BADGE_COOKIE } from "@/lib/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "인증 기능은 DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  let body: { email?: unknown; code?: unknown; major?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const major = typeof body.major === "string" ? body.major : "";

  const school = resolveSchool(email);
  if (!school || !isMajor(major)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const prisma = db();
  const row = await prisma.verifyCode.findUnique({ where: { email } });
  if (!row) {
    return NextResponse.json({ error: "인증 코드를 다시 요청해주세요" }, { status: 400 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.verifyCode.delete({ where: { email } }).catch(() => undefined);
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
    await prisma.verifyCode.update({ where: { email }, data: { attempts: { increment: 1 } } });
    return NextResponse.json(
      { error: `코드가 달라요 (${row.attempts + 1}/${MAX_ATTEMPTS})` },
      { status: 400 }
    );
  }

  // 성공했으면 코드는 즉시 폐기한다 — 재사용을 막는다.
  await prisma.verifyCode.delete({ where: { email } }).catch(() => undefined);

  const record = await prisma.studentVerification.upsert({
    where: { email },
    create: {
      email,
      schoolDomain: school.domain,
      schoolName: school.name,
      country: school.country,
      major,
    },
    // 재인증 시 학과가 바뀌었을 수 있다(전과·복수전공).
    update: { major, schoolDomain: school.domain, schoolName: school.name, country: school.country },
  });

  const badge = {
    schoolDomain: school.domain,
    schoolName: school.name,
    country: school.country,
    major,
    // 동문 디렉터리에서 본인 항목을 찾기 위한 열쇠. 이메일 대신 이것만 쿠키에 담는다.
    vid: record.id,
  };
  const jar = await cookies();
  jar.set(BADGE_COOKIE, await signBadge(badge), badgeCookieOptions);

  return NextResponse.json({ ok: true, badge });
}
