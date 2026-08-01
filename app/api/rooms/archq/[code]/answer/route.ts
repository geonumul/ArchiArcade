import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store } from "@/lib/store";
import { readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { ARCHQ_GRACE_MS, ARCHQ_QUESTION_MS, archqBank } from "@/lib/game/archq";
import {
  answerKey,
  archqView,
  cursorOf,
  isTimed,
  loadArchqRoom,
  tickArchq,
  type ArchqRoomState,
} from "@/lib/game/archq-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계자 맞히기 방 - 답 내기.
 *
 *   POST /api/rooms/archq/1234/answer   { questionIndex, pick }   pick 은 설계자 번호이거나
 *                                                                 시간이 다 됐으면 null
 *
 * 브라우저는 무엇을 골랐는지만 보낸다. 맞았는지, 몇 초 걸렸는지, 점수가 몇인지는 전부
 * 서버가 정한다. 점수를 받아 적으면 그 방의 순위는 제일 먼저 조작한 사람의 것이 된다.
 *
 * 문항 모드에서는 맞았는지를 바로 알려주지 않는다. 방은 대개 같은 자리에 모여 하는
 * 것이라, 먼저 답한 사람이 정답을 알면 그 자리에서 말이 새어 나간다. 마감이 지나
 * 다음 문항으로 넘어갈 때 폴링(GET)의 prev 로 다 같이 알게 된다. 타임어택은 각자
 * 진도를 나가므로 새어 나갈 곳이 없고, 바로 알려주지 않으면 다음 문제로 넘어갈 수도
 * 없어서 그 자리에서 알려 준다.
 *
 * 여기서 나온 점수는 ArchqScore 에 쓰지 않는다. 그 표는 혼자 한 판의 개인 최고 기록이고,
 * 방 점수를 섞으면 여럿이 짜고 한 사람에게 정답을 불러 주는 것만으로 순위표 1위를
 * 만들 수 있다.
 */

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;

  const jar = await cookies();
  const me = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!me) return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });

  // 한 사람이 답 요청으로 방을 두드리는 것을 막는다. 타임어택 120초에 80문항을 다 풀어도
  // 분당 40건이라 정상 플레이에는 닿지 않는 한도다.
  const rl = await rateLimit(`archq:answer:${me.sub}`, 90, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "조금 천천히 눌러주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { code?: unknown; questionIndex?: unknown; pick?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  // 방 코드는 주소에 있다. 본문에도 같이 보내는 경우를 받아 주되, 다르면 받지 않는다 -
  // 어느 쪽이 진짜인지 서버가 골라 주기 시작하면 둘이 어긋난 요청을 계속 만들게 된다.
  if (typeof body.code === "string" && body.code !== code) {
    return NextResponse.json({ error: "방 코드가 맞지 않아요" }, { status: 400 });
  }

  const found = await loadArchqRoom(code);
  if (found === "missing") return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
  if (found === "other") return NextResponse.json({ error: "다른 게임의 방이에요" }, { status: 409 });

  const bank = archqBank();
  if (!bank) return NextResponse.json({ error: "문제를 불러오지 못했어요" }, { status: 503 });

  const now = Date.now();
  /* 먼저 밀린 진행을 넘긴다. 마감이 지난 문항의 답이 들어오면 그 사이에 문항이 바뀌어
     있어야 맞고, 그래야 아래의 "지금 문항인가" 검사가 뜻을 갖는다. */
  const st = await tickArchq(code, found.st, now);

  if (st.ph !== "play") {
    return NextResponse.json(
      { error: st.ph === "lobby" ? "아직 시작하지 않았어요" : "이미 끝난 판이에요" },
      { status: 409 }
    );
  }
  if (!st.ps[me.sub]) {
    return NextResponse.json({ error: "이 방에 들어와 있지 않아요" }, { status: 403 });
  }

  const cursor = cursorOf(st, me.sub);
  const qi = Number(body.questionIndex);
  if (!Number.isInteger(qi) || qi !== cursor) {
    // 이미 넘어간 문항이거나 아직 오지 않은 문항이다. 화면이 어디에 있는지 다시 맞추도록
    // 지금 번호를 함께 알려 준다.
    return NextResponse.json({ error: "지금 문항이 아니에요", q: cursor }, { status: 409 });
  }
  if (cursor >= st.deck.length) {
    return NextResponse.json({ error: "더 풀 문항이 없어요", q: cursor }, { status: 409 });
  }

  // 화면의 시계가 0이 된 뒤에도 잠깐은 받아 준다. 회선이 느린 사람만 매번 시간 초과가
  // 되는 것은 실력의 문제가 아니다.
  if (!isTimed(st) && now > st.dl + ARCHQ_GRACE_MS) {
    return NextResponse.json({ error: "시간이 지났어요", q: cursor }, { status: 409 });
  }
  if (isTimed(st) && now > st.ends + ARCHQ_GRACE_MS) {
    return NextResponse.json({ error: "시간이 지났어요", q: cursor }, { status: 409 });
  }

  const item = st.deck[cursor];
  const pick = body.pick === null || body.pick === undefined ? null : Number(body.pick);
  if (pick !== null && (!Number.isInteger(pick) || item.o.indexOf(pick) < 0)) {
    // 보기에 없는 번호는 화면에 뜨지도 않은 답이다. 은행을 읽고 정답을 바로 써 보내는
    // 경우가 여기서 걸린다.
    return NextResponse.json({ error: "보기에 없는 답이에요" }, { status: 400 });
  }

  /* 걸린 시간은 서버가 잰다. 브라우저가 보내면 0.1초로 적어 보내는 것을 막을 방법이 없고,
     그러면 동점자를 가르는 기준이 사라진다.
     문항 모드는 그 문항이 열린 때부터, 타임어택은 앞 문항을 답한 때(첫 문항이면 시작한
     때)부터 잰다. 타임어택에서 문항이 열린 시각이라는 것은 사람마다 다르기 때문이다. */
  let since = st.startedAt;
  if (!isTimed(st)) {
    since = st.dl - ARCHQ_QUESTION_MS;
  } else {
    for (let i = 0; i < cursor; i++) {
      const a = st.ans[answerKey(i, me.sub)];
      if (a && a.t > since) since = a.t;
    }
  }
  const span = ARCHQ_QUESTION_MS + ARCHQ_GRACE_MS;
  const ms = Math.max(0, Math.min(now - since, isTimed(st) ? Math.max(span, 60_000) : span));

  const right = bank.bld[item.b]?.a ?? -1;
  const k: 0 | 1 = pick !== null && pick === right ? 1 : 0;

  const wrote = await store().patchRoomState(code, {
    into: "ans",
    add: { [answerKey(cursor, me.sub)]: { p: pick, k, ms, t: now } },
    onlyIfAbsent: true,
  });
  if (!wrote) {
    // 이미 답이 있거나 그 사이에 방이 사라졌다. 두 번째 답으로 첫 답을 덮을 수 있으면
    // 시간을 다 쓰고 나서 고쳐 낼 수 있게 된다.
    return NextResponse.json({ error: "이미 답했어요", q: cursor }, { status: 409 });
  }

  /* 모두 답했으면 마감까지 기다리지 않고 넘어간다. 다 답하고도 12초를 앉아 있으면
     판이 늘어진다. 다시 읽는 이유는 방금 쓴 답이 들어간 상태를 봐야 하기 때문이다. */
  const after = await loadArchqRoom(code);
  if (typeof after === "string") {
    return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
  }
  const moved = await tickArchq(code, after.st, Date.now());

  return NextResponse.json({
    ...archqView({
      st: moved,
      code: after.room.code,
      playerCount: after.room.playerCount,
      maxPlayers: after.room.maxPlayers,
      expiresAt: after.room.expiresAt,
      hostId: after.room.hostId,
      meId: me.sub,
      rightOf: (i) => bank.bld[moved.deck[i]?.b]?.a ?? null,
    }),
    /// 접수했다는 것만 알린다. 맞았는지는 타임어택이면 위의 prev 에, 문항 모드면 마감 뒤에 실린다.
    submitted: { i: cursor, waiting: !isTimed(st) },
  });
}
