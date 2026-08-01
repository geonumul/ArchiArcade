import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store } from "@/lib/store";
import { hashPassword, readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { DEFAULT_ROOM_SIZE, isRoomSize } from "@/lib/capacity";
import { makeRoomCode } from "@/lib/game/round";
import { ARCHQ_MODES, archqBank, archqDeckSize, drawArchqDeck, isArchqMode } from "@/lib/game/archq";
import { ARCHQ_STATE_V, roomNick, type ArchqRoomState } from "@/lib/game/archq-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계자 맞히기를 방에서 함께 하기 - 방 만들기.
 *
 * 밸런스 방(app/api/rooms)의 규칙을 그대로 따른다. 코드는 서버가 뽑고, 비밀번호는
 * 해시만 저장하며, 정원은 lib/capacity.ts 의 값 중에서 고르고, 수명은 24시간짜리
 * Room.expiresAt 하나뿐이다. 만료를 새로 만들지 않는다.
 *
 * 다른 점은 하나다. 이 방은 문제 덱을 서버가 뽑아 상태에 넣는다. 브라우저가 각자
 * 뽑으면 같은 방에 앉아 서로 다른 문제를 푸는 셈이고, 그렇게 나온 점수는 나란히 놓고
 * 이야기할 수 없다. 방으로 하는 의미가 거기에 있다.
 *
 *   POST /api/rooms/archq   { pw, mode, maxPlayers?, open?, lang?, name? }
 *                           → { code, mode, total, secs, maxPlayers, open }
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 밸런스 방과 같은 통을 쓴다. 게임을 번갈아 열어 제한을 피해 가지 못하게 하려는 것이다.
  const rl = await rateLimit(`room:create:${ipKey(ip)}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "방을 너무 자주 만들고 있어요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  /* 로그인해야 연다. 솔로도 로그인해야 열리는 카트리지이고(원본 aqStart), 무엇보다
     순위가 성립하려면 누가 누구인지를 서버가 알아야 한다. 이름을 브라우저가 정하면
     한 사람이 여러 명인 척 들어와 순위를 채울 수 있다. */
  const jar = await cookies();
  const me = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!me) {
    return NextResponse.json({ error: "로그인하면 방을 열 수 있어요", needLogin: true }, { status: 401 });
  }

  let body: {
    pw?: unknown;
    mode?: unknown;
    maxPlayers?: unknown;
    open?: unknown;
    lang?: unknown;
    name?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const pw = typeof body.pw === "string" ? body.pw.trim() : "";
  if (!pw || pw.length > 32) {
    return NextResponse.json({ error: "비밀번호를 확인해주세요" }, { status: 400 });
  }

  if (!isArchqMode(body.mode)) {
    return NextResponse.json({ error: "그런 모드가 없어요" }, { status: 400 });
  }
  const mode = body.mode;
  const lang = isLang(typeof body.lang === "string" ? body.lang : null) ? (body.lang as string) : "ko";
  const maxPlayers = isRoomSize(Number(body.maxPlayers)) ? Number(body.maxPlayers) : DEFAULT_ROOM_SIZE;
  // 시작 후 입장은 호스트가 켤 때만 열린다. 밸런스 방과 같은 기본값이다 - 모르는 사람이
  // 판 중간에 끼는 쪽보다 다음 판을 기다리는 쪽이 낫다.
  const open = body.open === true;

  const bank = archqBank();
  if (!bank) {
    return NextResponse.json({ error: "문제를 불러오지 못했어요" }, { status: 503 });
  }

  const s = store();
  // 살아있는 방과 코드가 겹치지 않을 때까지 재추첨 (밸런스 방과 동일하게 최대 5회)
  let code: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = makeRoomCode();
    if (!(await s.getRoom(candidate))) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 503 });
  }

  const deck = drawArchqDeck(bank, archqDeckSize(mode, bank.bld.length));
  const now = Date.now();
  const state: ArchqRoomState = {
    game: "archq",
    ph: "lobby",
    mode,
    lang,
    open,
    deck,
    q: 0,
    dl: 0,
    ends: 0,
    startedAt: 0,
    endedAt: 0,
    // 호스트도 한 사람으로 푼다. 정원에는 세지 않는다 - 밸런스 방에서도 참가자 목록은
    // 들어온 사람만 세고 호스트는 따로였다.
    ps: { [me.sub]: { n: roomNick(body.name, me.name), j: now } },
    ans: {},
    ts: now,
    v: ARCHQ_STATE_V,
  };

  await s.createRoom({ code, pwHash: await hashPassword(pw), hostId: me.sub, maxPlayers, state });

  // 덱은 돌려주지 않는다. 호스트라고 문제를 미리 보면 그 방의 점수는 뜻이 없다.
  return NextResponse.json({
    code,
    mode,
    total: deck.length,
    secs: ARCHQ_MODES[mode].secs || null,
    maxPlayers,
    open,
  });
}
