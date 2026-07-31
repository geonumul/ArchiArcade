import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자 접속기록 열람.
 *
 * 「개인정보의 안전성 확보조치 기준」 고시 제8조는 접속기록을 1년 이상 보관하라고만 하는
 * 것이 아니라 월 1회 이상 점검하라고도 한다(2026-10-31 개정 전 기준). 그래서 쌓기만 하고
 * 읽을 방법을 안 만들면 절반만 지킨 셈이 된다. 이 화면이 그 점검용 창구다.
 *
 * 접속기록 자체가 관리자의 IP 가 들어 있는 표라 아무나 열면 안 된다. 관리자가 아니면
 * 403 이 아니라 404 로 답한다 - 다른 관리자 화면과 같은 방식이고, 이런 주소가 있다는
 * 사실조차 알리지 않으려는 것이다.
 *
 * 이 조회는 스스로를 기록하지 않는다. 여기 남는 것은 관리자 본인의 접속 이력이지
 * 정보주체의 개인정보가 아니고, 점검할 때마다 한 줄씩 늘면 점검 기록이 점검 대상을
 * 밀어내기 때문이다.
 *
 *   GET /api/admin/access-log?days=30
 *     → { range: { from, to }, days, total,
 *         rows: [{ id, admin, ip, subject, action, at }] }
 */

const DEFAULT_DAYS = 30;
/// 보관 기간이 1년이므로 그보다 멀리 볼 일은 없다.
const MAX_DAYS = 365;
/// 한 번에 내보낼 줄 수. 이보다 많으면 화면에서 훑는 것이 아니라 다른 도구로 봐야 한다.
const PAGE = 500;

export async function GET(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims || !isAdminName(claims.name)) {
    // 관리자가 아니면 있는지조차 알리지 않는다.
    return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });
  }

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), MAX_DAYS) : DEFAULT_DAYS;

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);

  const prisma = db();
  const [rows, total] = await Promise.all([
    prisma.adminAccessLog.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: PAGE,
    }),
    prisma.adminAccessLog.count({ where: { createdAt: { gte: from } } }),
  ]);

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    days,
    // 잘려 나간 줄이 있는지 화면이 알 수 있게 전체 수를 같이 준다. 500줄만 보고
    // "이게 전부" 라고 판단하면 점검이 아니라 눈속임이 된다.
    total,
    rows: rows.map((r) => ({
      // id 가 BigInt 라 그대로 두면 JSON 으로 바뀌지 않는다. 문자열로 내보낸다.
      id: r.id.toString(),
      admin: r.admin,
      ip: r.ip,
      subject: r.subject,
      action: r.action,
      at: r.createdAt.toISOString(),
    })),
  });
}
