import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";
import { BANK_SIZE } from "@/lib/game/bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 문항 리액션 - 꿀잼 / 노잼.
 *
 * 예전에는 공용 저장소에 숫자만 쌓았다. 그러면 한 사람이 같은 문항을 몇 번이고 누를
 * 수 있고 목록을 통째로 덮어쓸 수도 있어서, "노잼이 많은 문항" 이라는 판단의 근거가
 * 되지 못했다. 이제 누가 눌렀는지를 표로 남겨 한 문항에 한 번만 세고, 노잼이 기준을
 * 넘으면 밸런스 조절 후보로 올린다.
 *
 *   GET    /api/reactions?idx=3     한 문항의 집계와 내가 누른 것
 *   POST   /api/reactions           { idx, kind }  로그인 필요
 *   GET    /api/reactions?flagged=1 관리자만. 손볼 문항 목록
 *   PATCH  /api/reactions           관리자만. 후보에서 내린다
 */

/// 노잼이 이만큼 쌓이면 후보로 올린다. 한 판이 20문항이라 다섯이면 여러 방에서
/// 반복해서 걸렸다는 뜻이 된다.
const FLAG_AT = 5;
const KINDS = ["hot", "meh"] as const;
type Kind = (typeof KINDS)[number];

async function whoami() {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims) return null;
  return { id: claims.sub, name: claims.name, admin: isAdminName(claims.name) };
}

export async function GET(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const url = new URL(req.url);
  const prisma = db();

  /* 관리자용: 손볼 문항 목록.
     관리자만 보는 자리지만 접속기록(고시 제8조)을 남기지 않는다. 나가는 값이 문항 번호와
     꿀잼·노잼 수뿐이라 "처리한 정보주체 정보"에 적을 사람이 없기 때문이다. 누가 눌렀는지는
     ReactionVote 에 있지만 이 조회는 그 표를 건드리지 않는다. 아래 PATCH 도 같은 이유로
     남기지 않는다 - 문항의 상태를 바꿀 뿐 사람의 정보를 고치는 것이 아니다. */
  if (url.searchParams.get("flagged")) {
    const me = await whoami();
    if (!me?.admin) return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });

    const rows = await prisma.questionReact.findMany({
      where: { flaggedAt: { not: null }, resolvedAt: null },
      orderBy: [{ meh: "desc" }],
      take: 50,
    });
    return NextResponse.json({
      rows: rows.map((r) => ({
        idx: r.questionIdx,
        hot: r.hot,
        meh: r.meh,
        flaggedAt: r.flaggedAt?.toISOString() ?? null,
      })),
    });
  }

  const idx = Number(url.searchParams.get("idx"));
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE) {
    return NextResponse.json({ error: "잘못된 문항" }, { status: 400 });
  }

  const me = await whoami();
  const [row, mine] = await Promise.all([
    prisma.questionReact.findUnique({ where: { questionIdx: idx } }),
    me
      ? prisma.reactionVote.findUnique({ where: { questionIdx_userId: { questionIdx: idx, userId: me.id } } })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    idx,
    hot: row?.hot ?? 0,
    meh: row?.meh ?? 0,
    mine: mine?.kind ?? null,
    loggedIn: Boolean(me),
  });
}

export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) {
    return NextResponse.json({ error: "로그인하면 평가할 수 있어요", needLogin: true }, { status: 401 });
  }

  let body: { idx?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const idx = Number(body.idx);
  const kind = (KINDS as readonly string[]).includes(String(body.kind)) ? (String(body.kind) as Kind) : null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE || !kind) {
    return NextResponse.json({ error: "잘못된 값" }, { status: 400 });
  }

  const prisma = db();

  /* 한 문항에 한 번만 센다. 이미 눌렀으면 바꿀 수 있게 하되, 바꿀 때는 예전 것을
     빼고 새 것을 더한다 - 그러지 않으면 눌렀다 바꿨다 하며 숫자를 부풀릴 수 있다. */
  const prev = await prisma.reactionVote.findUnique({
    where: { questionIdx_userId: { questionIdx: idx, userId: me.id } },
  });
  if (prev?.kind === kind) {
    const cur = await prisma.questionReact.findUnique({ where: { questionIdx: idx } });
    return NextResponse.json({ ok: true, idx, hot: cur?.hot ?? 0, meh: cur?.meh ?? 0, mine: kind });
  }

  await prisma.reactionVote.upsert({
    where: { questionIdx_userId: { questionIdx: idx, userId: me.id } },
    create: { questionIdx: idx, userId: me.id, kind },
    update: { kind },
  });

  const delta = { hot: 0, meh: 0 };
  delta[kind] = 1;
  if (prev) delta[prev.kind as Kind] -= 1;

  const row = await prisma.questionReact.upsert({
    where: { questionIdx: idx },
    create: { questionIdx: idx, hot: Math.max(0, delta.hot), meh: Math.max(0, delta.meh) },
    update: { hot: { increment: delta.hot }, meh: { increment: delta.meh } },
  });

  // 노잼이 기준을 넘으면 후보로 올린다. 이미 올라와 있으면 그대로 둔다.
  if (row.meh >= FLAG_AT && !row.flaggedAt) {
    await prisma.questionReact.update({
      where: { questionIdx: idx },
      data: { flaggedAt: new Date(), resolvedAt: null },
    });
  }

  return NextResponse.json({ ok: true, idx, hot: row.hot, meh: row.meh, mine: kind });
}

/// 관리자가 후보에서 내린다. 문항을 고쳤거나 그냥 두기로 했을 때.
export async function PATCH(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me?.admin) return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });

  let body: { idx?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const idx = Number(body.idx);
  if (!Number.isInteger(idx)) return NextResponse.json({ error: "잘못된 문항" }, { status: 400 });

  const done = await db()
    .questionReact.update({ where: { questionIdx: idx }, data: { resolvedAt: new Date() } })
    .catch(() => null);
  if (!done) return NextResponse.json({ error: "그 문항을 찾지 못했어요" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
