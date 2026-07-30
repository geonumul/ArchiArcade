import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readBadge, BADGE_COOKIE } from "@/lib/badge";
import { MAJORS } from "@/lib/school";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 현재 브라우저가 가진 뱃지. 없으면 null.
export async function GET() {
  const jar = await cookies();
  const badge = await readBadge(jar.get(BADGE_COOKIE)?.value);
  return NextResponse.json({ badge, majors: MAJORS });
}

/**
 * 뱃지 해제.
 *
 * 쿠키만 지우면 화면에서는 뱃지가 사라지는데 학교 순위에는 그 학교가 그대로 남는다
 * (순위의 인원 수는 인증 기록을 세기 때문이다). 해제했는데 학교가 남아 있으면
 * 지운 것이 아니므로, 인증 기록과 동문 목록 항목까지 함께 지운다.
 *
 * 다만 이미 던진 표에는 학교가 찍혀 있고 그 표는 되돌리지 않는다 — 그때는 정말
 * 그 학교 학생이 던진 표였기 때문이다. 다시 인증하려면 메일 인증을 새로 받으면 된다.
 */
export async function DELETE() {
  const jar = await cookies();
  const badge = await readBadge(jar.get(BADGE_COOKIE)?.value);

  if (prisma && badge?.vid) {
    await prisma.studentVerification.delete({ where: { id: badge.vid } }).catch(() => undefined);
  }

  jar.delete(BADGE_COOKIE);
  return NextResponse.json({ ok: true, recordRemoved: Boolean(badge?.vid) });
}
