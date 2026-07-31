import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readBadge, BADGE_COOKIE } from "@/lib/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  schoolDomain: string;
  schoolName: string;
  schoolLocal: string | null;
  country: string;
  students: number;
  votes: number;
}

/**
 * 학교별 순위.
 *
 * 인증된 표만 센다. 자기 신고 학교까지 섞으면 "건축학도 인식 조사"라는 근거가
 * 무너지기 때문이다. 뱃지가 없는 표는 전역 통계에는 들어가되 여기엔 오르지 않는다.
 */
export async function GET(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ rows: [], mine: null, disabled: true });
  }

  const country = new URL(req.url).searchParams.get("country");
  const prisma = db();

  const students = await prisma.studentVerification.groupBy({
    by: ["schoolDomain", "schoolName", "schoolLocal", "country"],
    _count: { _all: true },
    where: country ? { country } : undefined,
  });

  const votes = await prisma.vote.groupBy({
    by: ["schoolDomain"],
    _count: { _all: true },
    where: { schoolDomain: { not: null } },
  });
  const voteBy = new Map(votes.map((v) => [v.schoolDomain as string, v._count._all]));

  const rows: Row[] = students
    .map((s) => ({
      schoolDomain: s.schoolDomain,
      schoolName: s.schoolName,
      schoolLocal: s.schoolLocal,
      country: s.country,
      students: s._count._all,
      votes: voteBy.get(s.schoolDomain) ?? 0,
    }))
    // 참여 표 수를 먼저 본다 — "몇 명이 등록했나"보다 "얼마나 했나"가 경쟁 요소다.
    .sort((a, b) => b.votes - a.votes || b.students - a.students)
    .slice(0, 50);

  const jar = await cookies();
  const badge = await readBadge(jar.get(BADGE_COOKIE)?.value);
  const mine = badge
    ? {
        schoolDomain: badge.schoolDomain,
        schoolName: badge.schoolName,
        schoolLocal: badge.schoolLocal ?? null,
        rank: rows.findIndex((r) => r.schoolDomain === badge.schoolDomain) + 1 || null,
      }
    : null;

  return NextResponse.json({ rows, mine, countries: [...new Set(students.map((s) => s.country))].sort() });
}
