import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자용 학교별 인증자 목록.
 *
 * 일반 동문 목록(/api/alumni)은 자기 학교만, 공개에 동의한 사람만 보여 준다.
 * 운영하는 쪽은 어느 학교에 몇 명이 모였는지 전체를 봐야 하므로 따로 둔다.
 *
 * 공개하지 않은 사람의 이름·회사는 내보내지 않는다. "공개에 동의한 사람만 보입니다"
 * 라고 화면에 적어 두고 관리자 화면에서 그걸 뒤집으면 그 약속이 거짓이 된다.
 * 몇 명인지와 어느 학과인지까지만 보이고, 그것만으로도 어디에 사람이 모이는지는 알 수 있다.
 */

const MAX_SCHOOLS = 100;
const MAX_PEOPLE = 50;

export async function GET() {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims || !isAdminName(claims.name)) {
    // 관리자가 아니면 있는지조차 알리지 않는다.
    return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });
  }

  const prisma = db();
  const rows = await prisma.studentVerification.findMany({
    select: {
      schoolDomain: true,
      schoolName: true,
      schoolLocal: true,
      country: true,
      major: true,
      directoryOptIn: true,
      displayName: true,
      status: true,
      gradYear: true,
      company: true,
      verifiedAt: true,
    },
    orderBy: { verifiedAt: "desc" },
  });

  const bySchool = new Map<
    string,
    {
      domain: string;
      name: string;
      local: string | null;
      country: string;
      total: number;
      listed: number;
      people: Array<{
        displayName: string | null;
        major: string;
        status: string;
        gradYear: number | null;
        company: string | null;
        listed: boolean;
      }>;
    }
  >();

  for (const r of rows) {
    let s = bySchool.get(r.schoolDomain);
    if (!s) {
      s = {
        domain: r.schoolDomain,
        name: r.schoolName,
        local: r.schoolLocal,
        country: r.country,
        total: 0,
        listed: 0,
        people: [],
      };
      bySchool.set(r.schoolDomain, s);
    }
    s.total++;
    if (r.directoryOptIn) s.listed++;

    if (s.people.length < MAX_PEOPLE) {
      s.people.push({
        // 공개하지 않은 사람은 이름·회사를 비운다. 학과와 재학 여부만 남긴다.
        displayName: r.directoryOptIn ? r.displayName : null,
        major: r.major,
        status: r.status,
        gradYear: r.directoryOptIn ? r.gradYear : null,
        company: r.directoryOptIn ? r.company : null,
        listed: r.directoryOptIn,
      });
    }
  }

  const schools = [...bySchool.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, MAX_SCHOOLS);

  return NextResponse.json({
    schools,
    totalVerified: rows.length,
    totalSchools: bySchool.size,
  });
}
