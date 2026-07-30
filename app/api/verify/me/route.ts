import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readBadge, BADGE_COOKIE } from "@/lib/badge";
import { MAJORS } from "@/lib/school";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 현재 브라우저가 가진 뱃지. 없으면 null.
export async function GET() {
  const jar = await cookies();
  const badge = await readBadge(jar.get(BADGE_COOKIE)?.value);
  return NextResponse.json({ badge, majors: MAJORS });
}

/// 뱃지 해제(로그아웃 성격). DB 의 인증 기록은 남기고 이 브라우저의 표시만 지운다.
export async function DELETE() {
  const jar = await cookies();
  jar.delete(BADGE_COOKIE);
  return NextResponse.json({ ok: true });
}
