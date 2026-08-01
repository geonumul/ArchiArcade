import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store, type RoomRecord } from "@/lib/store";
import { verifyPassword, readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { liarBank, liarWords } from "@/lib/game/liar-bank";
import {
  LIAR_REVEAL_MS,
  LIAR_VOTE_MS,
  LIAR_GUESS_MS,
  LIAR_MAX,
  liarNick,
  liarView,
  type LiarState,
} from "@/lib/game/liar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계실 라이어게임 - 방 안에서 일어나는 일 전부.
 *
 * 단계를 넘기는 일은 여기서 한다. 호스트의 브라우저에 맡기면 그 사람이 창을 닫는
 * 순간 방이 그 단계에서 멈추고, 나머지는 영문도 모른 채 기다리게 된다. 상태를 물어볼
 * 때마다 시간이 지났는지 보고 지났으면 넘긴다.
 *
 *   GET    /api/rooms/liar/1234   지금 상태. 2초마다 물어본다
 *   POST   /api/rooms/liar/1234   입장 { pw, name? }
 *   PATCH  /api/rooms/liar/1234   { action: "start" | "vote" | "guess", target?, guess? }
 *   DELETE /api/rooms/liar/1234   호스트가 방을 닫는다
 */

function gone() {
  return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
}

function wrongGame() {
  return NextResponse.json({ error: "다른 게임의 방이에요" }, { status: 409 });
}

async function whoami() {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  return claims ? { id: claims.sub, name: claims.name } : null;
}

function asLiar(room: RoomRecord): LiarState | null {
  const st = room.state as Partial<LiarState> | null;
  return st && st.game === "liar" ? (st as LiarState) : null;
}

/**
 * 시간이 지난 단계를 넘긴다.
 *
 * 읽기처럼 보이는 자리에서 상태를 고치는 것이 이상해 보이지만, 그러지 않으면 진행이
 * 누군가의 브라우저에 달리게 된다. 넘길 때는 expect 를 걸어 한 번만 넘어가게 한다 -
 * 네 사람이 동시에 물어보면 네 번 넘어가서 단계를 건너뛴다.
 */
async function advance(code: string, st: LiarState): Promise<LiarState> {
  if (!st.until || Date.now() < st.until) return st;
  const s = store();
  const now = Date.now();

  const next: Partial<LiarState> =
    st.ph === "reveal"
      ? { ph: "talk", until: now + st.talk * 1000 }
      : st.ph === "talk"
        ? { ph: "vote", until: now + LIAR_VOTE_MS }
        : st.ph === "vote"
          ? // 지목이 끝나면 라이어에게 한 번 맞힐 기회를 준다. 잡히지 않았으면 그대로 끝.
            { ph: "guess", until: now + LIAR_GUESS_MS }
          : st.ph === "guess"
            ? { ph: "result", until: 0 }
            : {};

  if (!Object.keys(next).length) return st;
  const ok = await s.patchRoomState(code, { set: { ...next, ts: now }, expect: { ph: st.ph } });
  return ok ? { ...st, ...next, ts: now } : st;
}

/// 맞히기 후보 개수. 90개를 다 늘어놓으면 고를 수가 없고, 너무 적으면 찍어서 맞는다.
const GUESS_CHOICES = 5;

function view(st: LiarState, room: RoomRecord, meId: string | null) {
  const bank = liarBank();
  const words = bank ? liarWords(bank, st.lang) : [];
  return liarView({
    st,
    code: room.code,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    meId,
    /* 그 사람이 볼 글자만 만든다. 라이어에게는 가짜와 가짜 설명이, 나머지에게는 진짜가
       간다. 분류는 모두에게 같은 것이 가야 이야기의 틀이 하나로 잡힌다. */
    wordFor: (wi, isLiar) => {
      const e = words[wi];
      if (!e) return null;
      return { w: isLiar ? e.f : e.w, c: e.c, d: (isLiar ? e.df : e.d) ?? "" };
    },
    /* 후보는 서버가 고른다. 화면이 고르면 목록을 만드는 코드가 진짜 답을 알아야 하고,
       그러면 개발자 도구로 그대로 보인다. 진짜 답 하나에 아무거나 섞어 자리를 흩는다. */
    candidates: (wi) => {
      const rest = words.map((_, i) => i).filter((i) => i !== wi);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const pick = [wi, ...rest.slice(0, GUESS_CHOICES - 1)];
      for (let i = pick.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pick[i], pick[j]] = [pick[j], pick[i]];
      }
      return pick.map((i) => ({ i, w: words[i].w }));
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await store().getRoom(code);
  if (!room) return gone();
  const st0 = asLiar(room);
  if (!st0) return wrongGame();

  const me = await whoami();
  const st = await advance(code, st0);
  return NextResponse.json(view(st, room, me?.id ?? null));
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const me = await whoami();
  if (!me) {
    return NextResponse.json({ error: "로그인하면 들어갈 수 있어요", needLogin: true }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`room:join:${ipKey(ip)}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  let body: { pw?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const s = store();
  const room = await s.getRoom(code);
  if (!room) return gone();
  const st = asLiar(room);
  if (!st) return wrongGame();

  // 이미 들어와 있으면 비밀번호를 다시 묻지 않는다. 새로고침이 곧 재입장이기 때문이다.
  if (!st.ps[me.id]) {
    const pw = typeof body.pw === "string" ? body.pw : "";
    if (!(await verifyPassword(room.pwHash, pw))) {
      return NextResponse.json({ error: "비밀번호가 달라요" }, { status: 403 });
    }
    /* 시작한 뒤에는 못 들어온다. 중간에 들어온 사람은 제시어를 못 봐서 자기 잘못 없이
       라이어처럼 보이고, 그러면 그 판은 그 사람 것이 아니게 된다. */
    if (st.ph !== "lobby") {
      return NextResponse.json({ error: "이미 시작한 방이에요", started: true }, { status: 409 });
    }
    if (Object.keys(st.ps).length >= LIAR_MAX) {
      return NextResponse.json({ error: "자리가 다 찼어요" }, { status: 409 });
    }

    const name = liarNick(typeof body.name === "string" ? body.name : "", me.name);
    /* onlyIfAbsent 로 넣는다. 두 사람이 마지막 한 자리에 동시에 들어오면 한쪽만
       들어가야 하는데, 읽고 쓰기로 하면 둘 다 들어간다. */
    await s.patchRoomState(code, {
      into: "ps",
      add: { [me.id]: { n: name, j: Date.now() } },
      onlyIfAbsent: true,
      set: { ts: Date.now() },
    });
  }

  const after = await s.getRoom(code);
  const stAfter = after ? asLiar(after) : null;
  if (!after || !stAfter) return gone();
  return NextResponse.json(view(stAfter, after, me.id));
}

export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });

  let body: { action?: unknown; target?: unknown; guess?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const s = store();
  const room = await s.getRoom(code);
  if (!room) return gone();
  const st = asLiar(room);
  if (!st) return wrongGame();
  if (!st.ps[me.id]) return NextResponse.json({ error: "이 방에 없어요" }, { status: 403 });

  const action = String(body.action ?? "");
  const now = Date.now();

  if (action === "start") {
    if (room.hostId !== me.id) return NextResponse.json({ error: "방장만 시작할 수 있어요" }, { status: 403 });
    if (st.ph !== "lobby") return NextResponse.json({ error: "이미 시작했어요" }, { status: 409 });

    const ids = Object.keys(st.ps);
    if (ids.length < st.need) {
      return NextResponse.json({ error: `${st.need}명부터 시작할 수 있어요`, need: st.need }, { status: 409 });
    }

    const bank = liarBank();
    const words = bank ? liarWords(bank, st.lang) : [];
    if (!words.length) return NextResponse.json({ error: "제시어를 불러오지 못했어요" }, { status: 503 });

    /* 제시어와 라이어를 여기서 정한다. 방을 만들 때 정해 두면, 사람이 차는 동안
       나갔다 들어오는 것만으로 누가 라이어인지 좁힐 수 있다. */
    const wi = Math.floor(Math.random() * words.length);
    const liar = ids[Math.floor(Math.random() * ids.length)];

    const ok = await s.patchRoomState(code, {
      set: { ph: "reveal", wi, liar, votes: {}, guess: null, startedAt: now, until: now + LIAR_REVEAL_MS, ts: now },
      expect: { ph: "lobby" },
    });
    if (!ok) return NextResponse.json({ error: "이미 시작했어요" }, { status: 409 });
  } else if (action === "vote") {
    if (st.ph !== "vote") return NextResponse.json({ error: "지금은 지목할 때가 아니에요" }, { status: 409 });
    const target = String(body.target ?? "");
    if (!st.ps[target]) return NextResponse.json({ error: "그런 사람이 없어요" }, { status: 400 });
    if (target === me.id) return NextResponse.json({ error: "자기를 지목할 수는 없어요" }, { status: 400 });

    // 한 번 던진 표는 못 바꾼다. 바꿀 수 있으면 남들 눈치를 보다 마지막에 몰아준다.
    await s.patchRoomState(code, {
      into: "votes",
      add: { [me.id]: target },
      onlyIfAbsent: true,
      set: { ts: now },
    });

    /* 다 지목했으면 기다리지 않고 넘어간다. 남은 시간을 멀뚱히 보고 있을 이유가 없다. */
    const after = await s.getRoom(code);
    const stA = after ? asLiar(after) : null;
    if (stA && Object.keys(stA.votes).length >= Object.keys(stA.ps).length) {
      await s.patchRoomState(code, {
        set: { ph: "guess", until: Date.now() + LIAR_GUESS_MS, ts: Date.now() },
        expect: { ph: "vote" },
      });
    }
  } else if (action === "guess") {
    if (st.ph !== "guess") return NextResponse.json({ error: "지금은 맞힐 때가 아니에요" }, { status: 409 });
    if (me.id !== st.liar) return NextResponse.json({ error: "라이어만 맞힐 수 있어요" }, { status: 403 });
    const guess = Number(body.guess);
    if (!Number.isInteger(guess)) return NextResponse.json({ error: "잘못된 값" }, { status: 400 });

    await s.patchRoomState(code, {
      set: { guess, ph: "result", until: 0, ts: now },
      expect: { ph: "guess" },
    });
  } else {
    return NextResponse.json({ error: "알 수 없는 동작" }, { status: 400 });
  }

  const after = await s.getRoom(code);
  const stAfter = after ? asLiar(after) : null;
  if (!after || !stAfter) return gone();
  return NextResponse.json(view(stAfter, after, me.id));
}

export async function DELETE(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const s = store();
  const room = await s.getRoom(code);
  if (!room) return gone();
  if (room.hostId !== me.id) return NextResponse.json({ error: "방장만 닫을 수 있어요" }, { status: 403 });

  await s.deleteRoom(code);
  return NextResponse.json({ ok: true });
}
