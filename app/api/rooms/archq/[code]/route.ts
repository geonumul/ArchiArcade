import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store, type RoomRecord } from "@/lib/store";
import { verifyPassword, readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { ARCHQ_MODES, ARCHQ_QUESTION_MS, archqBank } from "@/lib/game/archq";
import {
  archqView,
  isTimed,
  loadArchqRoom,
  roomNick,
  tickArchq,
  type ArchqRoomState,
} from "@/lib/game/archq-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계자 맞히기 방 - 상태·입장·진행.
 *
 * 밸런스 방(app/api/rooms/[code])과 같은 자리, 같은 동사를 쓴다. 폴링 모양을 새로 만들지
 * 않는다 - 화면이 방마다 다른 방식으로 물어보게 되면 어느 쪽이 진짜인지 알 수 없게 된다.
 *
 *   GET    /api/rooms/archq/1234        지금 상태. 2초마다 물어본다
 *   POST   /api/rooms/archq/1234        입장 { pw, name? }
 *   PATCH  /api/rooms/archq/1234        호스트 조작 { action: "start"|"next"|"end"|"open", open? }
 *   DELETE /api/rooms/archq/1234        호스트가 방을 닫는다
 *
 * 답을 내는 것은 여기가 아니라 /api/rooms/archq/1234/answer 다.
 *
 * 상태에는 덱 전체가 들어 있지만 응답에는 지금 문항 하나만 실린다(archqView). 그대로
 * 내보내면 네트워크 탭을 한 번 여는 것으로 남은 문제가 순서까지 다 보인다.
 */

type Ctx = { params: Promise<{ code: string }> };

async function whoami() {
  const jar = await cookies();
  return readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
}

/// 밸런스 방을 이 주소로 물어본 경우. 남의 게임 상태를 이 규칙으로 다루면 안 된다.
function notArchq() {
  return NextResponse.json({ error: "다른 게임의 방이에요", game: "balance" }, { status: 409 });
}

function gone() {
  return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
}

/// 응답 만들기. 지나간 문항의 정답은 은행을 봐야 알 수 있어 여기서 함께 넘긴다.
function view(st: ArchqRoomState, room: RoomRecord, meId: string | null) {
  const bank = archqBank();
  return archqView({
    st,
    code: room.code,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
    expiresAt: room.expiresAt,
    hostId: room.hostId,
    meId,
    rightOf: bank ? (i) => bank.bld[st.deck[i]?.b]?.a ?? null : undefined,
  });
}

/**
 * 지금 상태. 참가자가 2초마다 부른다.
 *
 * 읽기만 하는 것처럼 보이지만 밀린 진행을 여기서 넘긴다. 진행을 호스트의 브라우저에
 * 맡기면 그 사람이 창을 닫는 순간 방이 그 문항에서 멈춰 버린다.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const found = await loadArchqRoom(code);
  if (found === "missing") return gone();
  if (found === "other") return notArchq();

  const me = await whoami();
  const st = await tickArchq(code, found.st);
  return NextResponse.json(view(st, found.room, me?.sub ?? null));
}

/**
 * 입장.
 *
 * 비밀번호를 먼저 보고 그 다음에 정원을 본다. 순서가 반대면 비밀번호를 모르는 사람도
 * 정원이 찼는지로 방의 상태를 떠볼 수 있다. 밸런스 방과 같은 순서다.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;

  // 출처별 시도와 실패를 따로 센다. 방 단위로 모든 시도를 세면 정원 50인 방이 정원을
  // 채우지 못한다. 밸런스 방과 같은 통, 같은 한도를 쓴다.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const perIp = await rateLimit(`room:join:ip:${ipKey(ip)}`, 30, 60);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "입장 시도가 너무 많아요" },
      { status: 429, headers: { "retry-after": String(perIp.retryAfterSec) } }
    );
  }

  const me = await whoami();
  if (!me) {
    return NextResponse.json({ error: "로그인하면 들어갈 수 있어요", needLogin: true }, { status: 401 });
  }

  let body: { pw?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const found = await loadArchqRoom(code);
  if (found === "missing") return gone();
  if (found === "other") return notArchq();

  const { ok } = await verifyPassword(typeof body.pw === "string" ? body.pw : "", found.room.pwHash);
  if (!ok) {
    // 네 자리 비밀번호라 무차별 대입이 현실적인 위협이다. 실패만 세어 정상 입장에는
    // 영향을 주지 않으면서 추측 속도를 제한한다.
    const fails = await rateLimit(`room:join:fail:${code}`, 10, 60);
    if (!fails.allowed) {
      return NextResponse.json(
        { error: "비밀번호 시도가 너무 많아요" },
        { status: 429, headers: { "retry-after": String(fails.retryAfterSec) } }
      );
    }
    return NextResponse.json({ error: "비밀번호가 달라요" }, { status: 403 });
  }

  /* 이미 들어와 있는 사람이면 그대로 다시 들여보낸다. 새로고침 한 번에 정원이 하나
     줄어들면 안 되고, 판이 시작된 뒤라도 원래 있던 사람은 돌아올 수 있어야 한다. */
  if (found.st.ps[me.sub]) {
    const st = await tickArchq(code, found.st);
    return NextResponse.json({ ...view(st, found.room, me.sub), rejoined: true });
  }

  /* 시작한 방은 기본으로 잠긴다. 호스트가 열어 둔 방만 중간 입장을 받는다. 밸런스 방과
     같은 규칙이다. 끝난 방은 열어 두었더라도 들어갈 자리가 없다. */
  if (found.st.ph === "end") {
    return NextResponse.json({ error: "이미 끝난 방이에요", started: true }, { status: 403 });
  }
  if (found.st.ph !== "lobby" && !found.st.open) {
    return NextResponse.json({ error: "이미 시작한 방이에요", started: true }, { status: 403 });
  }

  const join = await store().joinRoom(code);
  if (!join.ok) {
    if (join.reason === "not_found") return gone();
    if (join.reason === "service_full") {
      return NextResponse.json(
        { error: "지금 접속자가 많아요. 잠시 후 다시 시도해주세요", full: "service" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: `정원이 찼어요 (${join.playerCount ?? 0}/${join.maxPlayers ?? 0})`,
        full: "room",
        playerCount: join.playerCount,
        maxPlayers: join.maxPlayers,
      },
      { status: 409 }
    );
  }

  const added = await store().patchRoomState(code, {
    into: "ps",
    add: { [me.sub]: { n: roomNick(body.name, me.name), j: Date.now() } },
    onlyIfAbsent: true,
  });
  if (!added) return gone();

  const fresh = await loadArchqRoom(code);
  if (typeof fresh === "string") return gone();
  const st = await tickArchq(code, fresh.st);
  return NextResponse.json({
    ...view(st, { ...fresh.room, playerCount: join.playerCount, maxPlayers: join.maxPlayers }, me.sub),
  });
}

/**
 * 호스트 조작.
 *
 * 밸런스 방의 PATCH 는 상태를 통째로 받아 그대로 덮어쓴다. 여기서는 무엇을 할지만
 * 받는다. 상태를 브라우저가 써 보낼 수 있으면 점수도 덱도 브라우저가 정하는 것과
 * 같아서, 서버가 채점하는 의미가 사라진다.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { code } = await params;
  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });

  let body: { action?: unknown; open?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const found = await loadArchqRoom(code);
  if (found === "missing") return gone();
  if (found === "other") return notArchq();
  // 호스트가 아닌 사람에게는 이런 것이 있다는 사실도 알리지 않는다.
  if (found.room.hostId !== me.sub) return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });

  const st = found.st;
  const now = Date.now();
  const action = String(body.action ?? "");

  if (action === "open") {
    const open = body.open === true;
    await store().patchRoomState(code, { set: { open } });
    return NextResponse.json(view({ ...st, open }, found.room, me.sub));
  }

  if (action === "start") {
    if (st.ph !== "lobby") return NextResponse.json({ error: "이미 시작했어요" }, { status: 409 });
    /* 타임어택은 방 전체가 시계 하나를 나눠 쓴다. 사람마다 자기 시계를 돌리면 늦게
       시작한 사람이 더 오래 푸는 셈이 되어 같은 판이라고 할 수 없다. 그 시계를 켜는
       것이 호스트의 시작 버튼이다. */
    const set: Partial<ArchqRoomState> = {
      ph: "play",
      q: 0,
      startedAt: now,
      dl: isTimed(st) ? 0 : now + ARCHQ_QUESTION_MS,
      ends: isTimed(st) ? now + ARCHQ_MODES[st.mode].secs * 1000 : 0,
    };
    const okStart = await store().patchRoomState(code, { set, expect: { ph: "lobby" } });
    if (!okStart) return NextResponse.json({ error: "이미 시작했어요" }, { status: 409 });
    return NextResponse.json(view({ ...st, ...set } as ArchqRoomState, found.room, me.sub));
  }

  if (action === "next") {
    if (st.ph !== "play" || isTimed(st)) {
      return NextResponse.json({ error: "지금은 넘길 수 없어요" }, { status: 409 });
    }
    const last = st.q + 1 >= st.deck.length;
    const set = last
      ? { ph: "end" as const, endedAt: now, q: st.deck.length }
      : { q: st.q + 1, dl: now + ARCHQ_QUESTION_MS };
    await store().patchRoomState(code, { set, expect: { ph: "play", q: st.q } });
    const fresh = await loadArchqRoom(code);
    if (typeof fresh === "string") return gone();
    return NextResponse.json(view(fresh.st, fresh.room, me.sub));
  }

  if (action === "end") {
    await store().patchRoomState(code, { set: { ph: "end", endedAt: now } });
    return NextResponse.json(view({ ...st, ph: "end", endedAt: now }, found.room, me.sub));
  }

  return NextResponse.json({ error: "그런 동작이 없어요" }, { status: 400 });
}

/**
 * 방 닫기.
 *
 * 호스트만 지울 수 있다. 밸런스 방의 DELETE 는 누구나 부를 수 있어서, 코드만 알면 남의
 * 방을 끝낼 수 있다. 같은 구멍을 새로 만들지 않는다.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });

  const found = await loadArchqRoom(code);
  if (found === "missing") return NextResponse.json({ ok: true });
  if (found === "other") return notArchq();
  if (found.room.hostId !== me.sub) return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });

  await store().deleteRoom(code);
  return NextResponse.json({ ok: true });
}
