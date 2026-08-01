import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { store } from "@/lib/store";
import { prisma } from "@/lib/db";
import { hashPassword, readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { makeRoomCode } from "@/lib/game/round";
import { liarBank, liarWords } from "@/lib/game/liar-bank";
import {
  LIAR_STATE_V,
  LIAR_MAX,
  LIAR_MATCH_NEED,
  isNeed,
  isTalkLen,
  liarNick,
  liarWaitingKey,
  type LiarState,
} from "@/lib/game/liar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설계실 라이어게임 - 방 열기.
 *
 * 두 가지로 연다.
 *   아는 사람끼리  비밀번호를 정하고 인원을 고른다. 번호를 알려 줘야 들어온다.
 *   모르는 사람과  같은 언어의 빈 대기실이 있으면 거기로 들어가고, 없으면 하나 연다.
 *                 인원은 넷으로 고정한다.
 *
 * 제시어와 라이어는 판을 시작할 때 정한다. 방을 만드는 순간 정해 두면, 사람이 다 차기
 * 전에 나갔다 들어오는 것만으로 누가 라이어인지 좁힐 수 있다.
 *
 *   POST /api/rooms/liar        { pw, need, talk, lang, name }        → { code }
 *   POST /api/rooms/liar?match  { lang, name }                        → { code, made }
 */

/// 모르는 사람과 하는 방은 비밀번호가 없다. 아무나 들어와야 하는 자리라 숨길 것이
/// 없지만, 저장 형식은 같아야 하므로 공개된 고정값을 쓴다.
const OPEN_PW = "public";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 다른 게임 방과 같은 통을 쓴다. 게임을 번갈아 열어 제한을 피하지 못하게.
  const rl = await rateLimit(`room:create:${ipKey(ip)}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "방을 너무 자주 만들고 있어요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  /* 로그인해야 연다. 지목과 승패가 사람 단위로 성립해야 하는데, 이름을 브라우저가
     정하면 한 사람이 여러 명인 척 들어와 자기를 빼고 몰표를 만들 수 있다. */
  const jar = await cookies();
  const me = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!me) {
    return NextResponse.json({ error: "로그인하면 방을 열 수 있어요", needLogin: true }, { status: 401 });
  }

  let body: { pw?: unknown; need?: unknown; talk?: unknown; lang?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const bank = liarBank();
  if (!bank) return NextResponse.json({ error: "제시어를 불러오지 못했어요" }, { status: 503 });

  const lang = isLang(typeof body.lang === "string" ? body.lang : null) ? (body.lang as string) : "ko";
  if (!liarWords(bank, lang).length) {
    return NextResponse.json({ error: "그 언어의 제시어가 아직 없어요" }, { status: 503 });
  }

  const name = liarNick(typeof body.name === "string" ? body.name : "", me.name);
  const matching = new URL(req.url).searchParams.has("match");
  const s = store();

  /* 모르는 사람과 하기.
     같은 언어로 열려 있고 아직 시작하지 않은 방을 찾아 그리로 보낸다. 매번 새로 열면
     한 명씩 앉은 빈 방만 늘어나고 아무도 못 만난다. */
  if (matching) {
    const open = await findWaitingRoom(s, lang);
    if (open) return NextResponse.json({ code: open, made: false });
  }

  const pw = matching ? OPEN_PW : typeof body.pw === "string" ? body.pw.trim() : "";
  if (!pw || pw.length > 32) {
    return NextResponse.json({ error: "비밀번호를 확인해주세요" }, { status: 400 });
  }

  const need = matching ? LIAR_MATCH_NEED : isNeed(body.need) ? Number(body.need) : LIAR_MATCH_NEED;
  const talk = isTalkLen(body.talk) ? Number(body.talk) : 180;

  // 살아 있는 방과 코드가 겹치지 않을 때까지 다시 뽑는다. 다른 방과 같은 방식이다.
  let code: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = makeRoomCode();
    if (!(await s.getRoom(candidate))) {
      code = candidate;
      break;
    }
  }
  if (!code) return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 503 });

  const now = Date.now();
  const state: LiarState = {
    game: "liar",
    ph: "lobby",
    lang,
    need,
    talk,
    // 라이어게임은 시작하면 못 들어온다. 중간에 들어온 사람은 제시어를 못 봐서
    // 자기 잘못 없이 라이어처럼 보인다.
    open: false,
    wi: -1,
    liar: "",
    ps: { [me.sub]: { n: name, j: now } },
    votes: {},
    guess: null,
    until: 0,
    startedAt: 0,
    ts: now,
    v: LIAR_STATE_V,
  };

  await s.createRoom({
    code,
    pwHash: await hashPassword(pw),
    hostId: me.sub,
    state,
    maxPlayers: LIAR_MAX,
  });

  /* 모르는 사람과 하는 방을 새로 열었으면, 다음 사람이 찾아올 수 있게 적어 둔다.
     적어 두지 않으면 각자 자기 방만 하나씩 열고 아무도 못 만난다. */
  if (matching && prisma) {
    await prisma.kv
      .upsert({
        where: { key: liarWaitingKey(lang) },
        create: { key: liarWaitingKey(lang), value: code },
        update: { value: code },
      })
      .catch(() => null);
  }

  return NextResponse.json({ code, made: true, need, talk });
}

/**
 * 기다리는 중인 같은 언어 방 찾기.
 *
 * 방 목록을 통째로 훑지 않는다. 방이 많아지면 매번 전부 읽게 되고, 사람을 못 찾는
 * 것보다 그쪽이 먼저 문제가 된다. 대신 언어마다 "지금 모으는 중인 방" 을 한 칸에
 * 적어 두고 그것만 본다. 그 방이 사라졌거나 이미 시작했으면 없는 것으로 본다.
 */
async function findWaitingRoom(s: ReturnType<typeof store>, lang: string): Promise<string | null> {
  if (!prisma) return null;
  const row = await prisma.kv.findUnique({ where: { key: liarWaitingKey(lang) } });
  if (!row?.value) return null;
  const room = await s.getRoom(row.value);
  if (!room) return null;
  const st = room.state as Partial<LiarState> | null;
  if (!st || st.game !== "liar" || st.ph !== "lobby" || st.lang !== lang) return null;
  if (Object.keys(st.ps ?? {}).length >= (st.need ?? LIAR_MATCH_NEED)) return null;
  return room.code;
}
