import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readBadge, BADGE_COOKIE, signBadge, badgeCookieOptions } from "@/lib/badge";
import { isMajor } from "@/lib/majors";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 동문 디렉터리.
 *
 * 두 가지를 지킨다.
 *  1. 우리 학교만 본다 — 인증 쿠키의 schoolDomain 으로만 조회한다. 클라이언트가
 *     학교를 지정할 수 없으므로, 인증 없이 남의 학교 명단을 긁을 수 없다.
 *  2. 동의한 사람만 나온다 — directoryOptIn 이 기본 false 이고, 켠 사람만 목록에 든다.
 *     이메일은 어떤 경로로도 나가지 않는다.
 */

const MAX_ROWS = 200;
const NAME_MAX = 24;
const COMPANY_MAX = 40;

/// 재학인지 졸업인지. 학교 인증을 하는 시점에는 대개 재학생이라 그쪽이 기본이다.
const STATUSES = ["student", "alumni"] as const;
type Status = (typeof STATUSES)[number];
function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // 제어문자를 걷어내고 공백을 줄인다 — 목록 한 줄을 깨뜨리는 입력을 막는다.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

async function badgeOf() {
  const jar = await cookies();
  return readBadge(jar.get(BADGE_COOKIE)?.value);
}

export async function GET(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const badge = await badgeOf();
  if (!badge) {
    // 인증하지 않은 사람에게는 명단이 있는지조차 알리지 않는다.
    return NextResponse.json({ error: "학교 인증이 필요해요", needVerify: true }, { status: 403 });
  }

  const prisma = db();
  const url = new URL(req.url);
  const major = url.searchParams.get("major");
  const status = url.searchParams.get("status");

  const rows = await prisma.studentVerification.findMany({
    where: {
      schoolDomain: badge.schoolDomain,
      directoryOptIn: true,
      ...(major && isMajor(major) ? { major } : {}),
      ...(isStatus(status) ? { status } : {}),
    },
    select: { id: true, displayName: true, major: true, status: true, gradYear: true, company: true },
    // 재학생을 먼저 올린다 — 같은 학교에서 지금 마주칠 수 있는 사람이 먼저 보이는 게 낫다.
    orderBy: [{ status: "asc" }, { gradYear: "desc" }, { verifiedAt: "desc" }],
    take: MAX_ROWS,
  });

  const me = badge.vid
    ? await prisma.studentVerification.findUnique({
        where: { id: badge.vid },
        select: { directoryOptIn: true, displayName: true, status: true, gradYear: true, company: true },
      })
    : null;

  return NextResponse.json({
    school: { domain: badge.schoolDomain, name: badge.schoolName },
    rows: rows.map((r) => ({
      id: r.id,
      // 이름을 비워 둔 채 공개한 사람은 null 로 내보낸다. "익명" 문구는 화면이
      // 언어에 맞춰 붙이므로, 여기서 한국어를 박아 두면 9개 언어가 깨진다.
      displayName: r.displayName,
      major: r.major,
      status: r.status,
      gradYear: r.gradYear,
      company: r.company,
      mine: r.id === badge.vid,
    })),
    me: me ?? { directoryOptIn: false, displayName: null, status: "student", gradYear: null, company: null },
    // 쿠키가 vid 이전에 발급됐으면 설정을 저장할 수 없다.
    canEdit: Boolean(badge.vid),
  });
}

/// 내 항목 공개 설정. 본인 행(쿠키의 vid)만 고칠 수 있다.
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const badge = await badgeOf();
  if (!badge) {
    return NextResponse.json({ error: "학교 인증이 필요해요", needVerify: true }, { status: 403 });
  }
  if (!badge.vid) {
    return NextResponse.json(
      { error: "예전 방식으로 받은 뱃지예요. 학교 인증을 한 번 더 해주세요", reverify: true },
      { status: 409 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`alumni:${ip}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "너무 자주 바꿨어요. 잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: {
    optIn?: unknown;
    displayName?: unknown;
    status?: unknown;
    gradYear?: unknown;
    company?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const optIn = body.optIn === true;
  const displayName = clean(body.displayName, NAME_MAX);
  const company = clean(body.company, COMPANY_MAX);
  // 값이 이상하면 거절하지 않고 재학으로 둔다 — 상태 하나 때문에 저장이 막히면
  // 취업해서 고치러 온 사람이 아무것도 못 바꾸게 된다.
  const status: Status = isStatus(body.status) ? body.status : "student";

  // 재학 중이면 졸업연도를 묻지 않는다(화면에서 칸 자체가 사라진다). 예전에 졸업연도를
  // 적어 둔 사람이 다시 재학으로 바꾸면 그 값도 같이 비워, 목록에 남은 연도가 어긋나지 않게 한다.
  let gradYear: number | null = null;
  if (status === "alumni" && body.gradYear !== null && body.gradYear !== undefined && body.gradYear !== "") {
    const n = Number(body.gradYear);
    if (!Number.isInteger(n) || n < 1950 || n > new Date().getFullYear() + 10) {
      return NextResponse.json({ error: "졸업연도를 확인해주세요", field: "gradYear" }, { status: 400 });
    }
    gradYear = n;
  }

  const prisma = db();
  const updated = await prisma.studentVerification
    .update({
      where: { id: badge.vid },
      // 언제든 다시 저장해 덮어쓸 수 있다 — 졸업하거나 이직할 때마다 고치는 것이 정상이다.
      data: { directoryOptIn: optIn, displayName, status, gradYear, company },
      select: { directoryOptIn: true, displayName: true, status: true, gradYear: true, company: true },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "인증 기록을 찾지 못했어요" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, me: updated });
}

/**
 * 뱃지 갱신 — vid 가 없는 옛 쿠키를 이메일 재입력 없이 되살리는 경로는 없다.
 * 대신 학과만 바꾸는 요청을 받아 쿠키를 다시 서명한다(학과 변경은 재인증 없이 허용).
 */
export async function PATCH(req: Request) {
  const badge = await badgeOf();
  if (!badge) {
    return NextResponse.json({ error: "학교 인증이 필요해요", needVerify: true }, { status: 403 });
  }

  let body: { major?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!isMajor(body.major)) {
    return NextResponse.json({ error: "학과를 확인해주세요" }, { status: 400 });
  }

  if (hasDatabase && badge.vid) {
    await db()
      .studentVerification.update({ where: { id: badge.vid }, data: { major: body.major } })
      .catch(() => undefined);
  }

  const next = { ...badge, major: body.major };
  const jar = await cookies();
  jar.set(BADGE_COOKIE, await signBadge(next), badgeCookieOptions);
  return NextResponse.json({ ok: true, badge: next });
}
