import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";
import { logAdminAccess } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계자 맞히기 순위표.
 *
 * 모드마다 따로 겨룬다. 10문항과 30문항을 같이 줄 세우면 문항 수가 많은 쪽이 무조건
 * 위로 가서 순위가 뜻을 잃는다. 타임어택은 아예 단위가 다르다.
 *
 * 점수를 브라우저가 그냥 보내는 구조라, 마음먹으면 아무 숫자나 올릴 수 있다. 그래서
 * 서버가 최소한은 본다 - 모드가 허용하는 상한을 넘는 점수, 사람이 낼 수 없는 속도는
 * 받지 않는다. 완벽히 막을 수는 없지만, 열어 두면 순위표는 하루 만에 무의미해진다.
 *
 *   GET  /api/archq?mode=q10   상위 20명과 내 기록·내 순위
 *   POST /api/archq { mode, score, secs }   로그인 필요. 자기 최고 기록보다 좋을 때만 갱신
 */

/// 모드별 최대 점수와, 한 문항에 최소한 이만큼은 걸린다는 하한(초).
/// 12초 제한에 답을 읽는 시간까지 있으므로 1초 미만은 사람이 낸 기록으로 보지 않는다.
const MODES: Record<string, { max: number; minSecsPerQ: number; fixedSecs?: number }> = {
  q10: { max: 10, minSecsPerQ: 1 },
  q20: { max: 20, minSecsPerQ: 1 },
  q30: { max: 30, minSecsPerQ: 1 },
  t60: { max: 60, minSecsPerQ: 1, fixedSecs: 60 },
  t120: { max: 120, minSecsPerQ: 1, fixedSecs: 120 },
};

const TOP = 20;

async function whoami() {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  return claims ? { id: claims.sub, name: claims.name, admin: isAdminName(claims.name) } : null;
}

export async function GET(req: Request) {
  if (!hasDatabase) return NextResponse.json({ rows: [], mine: null });

  const mode = String(new URL(req.url).searchParams.get("mode") ?? "q10");
  if (!MODES[mode]) return NextResponse.json({ error: "그런 모드가 없어요" }, { status: 400 });

  const prisma = db();
  const me = await whoami();

  const [rows, mine] = await Promise.all([
    prisma.archqScore.findMany({
      where: { mode },
      orderBy: [{ score: "desc" }, { secs: "asc" }, { playedAt: "asc" }],
      take: TOP,
      select: { name: true, score: true, secs: true, playedAt: true, userId: true },
    }),
    me
      ? prisma.archqScore.findUnique({ where: { userId_mode: { userId: me.id, mode } } })
      : Promise.resolve(null),
  ]);

  /* 상위 20명 밖이면 자기가 몇 등인지 알 수 없다. 그것만으로는 다시 할 마음이 안
     생기므로, 자기보다 나은 기록이 몇 개인지 세어 등수를 따로 알려 준다. */
  let myRank: number | null = null;
  if (mine) {
    const better = await prisma.archqScore.count({
      where: {
        mode,
        OR: [{ score: { gt: mine.score } }, { score: mine.score, secs: { lt: mine.secs } }],
      },
    });
    myRank = better + 1;
  }

  return NextResponse.json({
    mode,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      score: r.score,
      secs: r.secs,
      me: Boolean(me) && r.userId === me!.id,
      // 관리자에게만 내려간다. 지울 대상을 가리키는 데 쓴다.
      userId: me?.admin ? r.userId : undefined,
    })),
    mine: mine ? { score: mine.score, secs: mine.secs, rank: myRank } : null,
    loggedIn: Boolean(me),
    admin: Boolean(me?.admin),
  });
}

export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) {
    return NextResponse.json({ error: "로그인하면 기록이 남아요", needLogin: true }, { status: 401 });
  }

  let body: { mode?: unknown; score?: unknown; secs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const mode = String(body.mode ?? "");
  const rule = MODES[mode];
  if (!rule) return NextResponse.json({ error: "그런 모드가 없어요" }, { status: 400 });

  const score = Number(body.score);
  const secs = rule.fixedSecs ?? Number(body.secs);
  if (!Number.isInteger(score) || score < 0 || score > rule.max) {
    return NextResponse.json({ error: "점수가 이상해요" }, { status: 400 });
  }
  if (!Number.isInteger(secs) || secs < 0 || secs > 3600) {
    return NextResponse.json({ error: "시간이 이상해요" }, { status: 400 });
  }
  // 사람이 낼 수 없는 속도는 받지 않는다.
  if (secs < score * rule.minSecsPerQ) {
    return NextResponse.json({ error: "기록을 확인하지 못했어요" }, { status: 400 });
  }

  const prisma = db();
  const cur = await prisma.archqScore.findUnique({ where: { userId_mode: { userId: me.id, mode } } });

  /* 더 좋을 때만 갱신한다. 많이 맞힌 쪽이 우선이고, 같으면 빨리 끝낸 쪽이다.
     기록이 나빠졌다고 덮어쓰면 최고 기록이라는 말이 성립하지 않는다. */
  const better = !cur || score > cur.score || (score === cur.score && secs < cur.secs);
  if (better) {
    await prisma.archqScore.upsert({
      where: { userId_mode: { userId: me.id, mode } },
      create: { userId: me.id, mode, score, secs, name: me.name },
      update: { score, secs, name: me.name, playedAt: new Date() },
    });
  }

  const rank =
    (await prisma.archqScore.count({
      where: {
        mode,
        OR: [
          { score: { gt: better ? score : cur!.score } },
          { score: better ? score : cur!.score, secs: { lt: better ? secs : cur!.secs } },
        ],
      },
    })) + 1;

  return NextResponse.json({ ok: true, best: better, rank });
}

/**
 * 관리자가 순위표에서 한 줄을 지운다.
 *
 * 점수를 브라우저가 보내는 구조라 서버 검사만으로는 조작을 다 막지 못한다. 말이 안 되는
 * 기록이 하나 올라가 있으면 그 아래 사람들은 아무리 해도 못 이기고, 순위표는 그날로
 * 볼 이유가 없어진다. 지울 수 있어야 하는 이유다.
 *
 *   DELETE /api/archq { mode, userId }
 */
export async function DELETE(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  // 권한이 없으면 이런 것이 있다는 사실도 알리지 않는다. 다른 관리자 화면과 같은 방식이다.
  if (!me?.admin) return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });

  let body: { mode?: unknown; userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const mode = String(body.mode ?? "");
  const userId = String(body.userId ?? "");
  if (!MODES[mode] || !userId) return NextResponse.json({ error: "잘못된 값" }, { status: 400 });

  const prisma = db();
  /* 지우기 전에 누구의 기록인지 읽어 둔다. 지운 뒤에는 접속기록에 적을 "처리한 정보주체"
     를 채울 방법이 없다(고시 제2조제3호). */
  const target = await prisma.archqScore.findUnique({ where: { userId_mode: { userId, mode } } });
  if (!target) return NextResponse.json({ error: "그 기록을 찾지 못했어요" }, { status: 404 });

  await prisma.archqScore.delete({ where: { userId_mode: { userId, mode } } });
  await logAdminAccess(req, {
    admin: me.name,
    subject: `${target.name} (${mode} ${target.score}점)`,
    action: "순위 기록 삭제",
  });

  return NextResponse.json({ ok: true });
}
