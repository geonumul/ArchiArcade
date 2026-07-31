import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자용 유입 채널 퍼널 표.
 *
 * /api/visits 가 쌓아 둔 칸을 채널별과 날짜별로 접어서 보여 준다. 채널별은 어디에
 * 홍보를 더 붙일지 정하는 데 쓰고, 날짜별은 특정 날 뭔가를 올린 뒤 실제로 사람이
 * 늘었는지 보는 데 쓴다. 둘을 같이 보지 않으면 "많이 들어왔는데 아무도 안 놀았다" 를
 * 놓친다.
 *
 * 여기 있는 숫자는 전부 여러 사람의 합이라 개인을 되짚을 수 있는 값이 없다.
 *
 * 그래서 관리자 접속기록(고시 제8조, lib/audit.ts)을 남기지 않는다. 고시가 남기라는 것은
 * "처리한 정보주체 정보"가 있는 접속이고, 이 화면에는 정보주체가 한 명도 등장하지 않는다.
 * 아무나 봐도 되는 합계까지 기록하면 표만 불어나 정작 봐야 할 줄이 묻힌다.
 *
 *   GET /api/admin/funnel?days=14
 *     → { range: { from, to },
 *         byChannel: [{ channel, visits, plays, signups, verifies }],
 *         byDay:     [{ day, visits, plays, signups, verifies }] }
 */

const DEFAULT_DAYS = 14;
/// 더 긴 창은 표로 읽기도 어렵고 접는 비용만 커진다. 그보다 오래된 흐름은 어차피
/// 날짜별 줄을 눈으로 훑어서 볼 값이 아니다.
const MAX_DAYS = 90;

const SUMS = { visits: true, plays: true, signups: true, verifies: true } as const;

/// day 가 YYYY-MM-DD 문자열이라 비교도 문자열로 한다. 이 형식은 사전순과 날짜순이
/// 같아서 gte/lte 범위 조건이 그대로 먹는다.
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

  const today = new Date();
  const to = dayKey(today);
  // 오늘을 포함해서 days 일이므로 하루를 뺀다. 이걸 빼먹으면 "최근 7일" 이 8일치가 된다.
  const from = dayKey(new Date(today.getTime() - (days - 1) * 86400000));
  const where = { day: { gte: from, lte: to } };

  const prisma = db();
  // 접는 일은 DB 에 맡긴다. 창이 90일이면 (채널 x 기기 x 언어) 조합 때문에 행이
  // 수천 개까지 늘어나는데, 그걸 전부 가져와 JS 에서 더할 이유가 없다.
  const [byChannelRows, byDayRows] = await Promise.all([
    prisma.visitStat.groupBy({ by: ["channel"], where, _sum: SUMS }),
    prisma.visitStat.groupBy({ by: ["day"], where, _sum: SUMS }),
  ]);

  const byChannel = byChannelRows
    .map((r) => ({
      channel: r.channel,
      visits: r._sum.visits ?? 0,
      plays: r._sum.plays ?? 0,
      signups: r._sum.signups ?? 0,
      verifies: r._sum.verifies ?? 0,
    }))
    // 사람이 많이 온 채널부터. 방문 수가 같으면 이름 순으로 고정해서 새로고침할 때마다
    // 줄 순서가 흔들리지 않게 한다.
    .sort((a, b) => b.visits - a.visits || a.channel.localeCompare(b.channel));

  const byDay = byDayRows
    .map((r) => ({
      day: r.day,
      visits: r._sum.visits ?? 0,
      plays: r._sum.plays ?? 0,
      signups: r._sum.signups ?? 0,
      verifies: r._sum.verifies ?? 0,
    }))
    // 날짜별은 흐름을 보는 값이라 옛날부터 차례로 둔다.
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({ range: { from, to }, byChannel, byDay });
}
