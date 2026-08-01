/**
 * 설계자 맞히기를 방에서 함께 할 때의 상태와 규칙.
 *
 * Room.state 하나에 다 들어간다. 표를 새로 만들지 않은 이유는 방과 수명이 같기
 * 때문이다. 방이 만료되면 이 기록도 같이 사라져야 하는데, 따로 두면 지우는 일을
 * 또 만들어야 하고 그러다 남는다.
 *
 * 상태에 정답을 적지 않는다. 덱에는 건물 번호와 보기 순서만 있고, 무엇이 정답인지는
 * 은행(bld[b].a)을 보는 서버만 안다. 은행은 누구나 읽을 수 있으니 정답 자체를 숨길
 * 수는 없지만, 그렇다고 상태를 "정답표" 모양으로 만들어 둘 이유는 없다. 더 중요한 것은
 * 아직 나오지 않은 문항을 내려보내지 않는 것이고, 그건 archqView 가 맡는다.
 *
 * 엔드포인트는 없다. app/api/rooms/archq/* 가 쓰는 라이브러리다.
 */
import { store, type RoomRecord, type RoomStatePatch } from "@/lib/store";
import {
  ARCHQ_GRACE_MS,
  ARCHQ_MODES,
  ARCHQ_QUESTION_MS,
  type ArchqDeckItem,
  type ArchqModeId,
} from "@/lib/game/archq";

/// 상태 형식 번호. 모양을 바꾸면 올린다. 살아 있는 방은 옛 모양 그대로 끝까지 간다.
export const ARCHQ_STATE_V = 1;

export interface ArchqPlayer {
  /// 방에서 쓰는 이름. 계정 이름과 다를 수 있다.
  n: string;
  /// 들어온 시각.
  j: number;
}

export interface ArchqAnswer {
  /// 고른 설계자. 시간이 다 되어 못 고른 것은 null 이다.
  p: number | null;
  /// 맞았으면 1. 서버만 쓴다.
  k: 0 | 1;
  /// 그 문항에 쓴 시간(ms). 서버가 잰 값이라 브라우저가 못 줄인다.
  ms: number;
  /// 답한 시각. 타임어택에서 다음 문항에 쓴 시간을 재는 기준이 된다.
  t: number;
}

export interface ArchqRoomState {
  /// 밸런스 방과 섞이지 않게 하는 표시. 같은 Room 표를 쓰기 때문에 반드시 있어야 한다.
  game: "archq";
  ph: "lobby" | "play" | "end";
  mode: ArchqModeId;
  lang: string;
  /// 시작한 뒤에도 들어올 수 있는가. 밸런스 방의 st.open 과 같은 뜻이다.
  open: boolean;
  /// 이 방이 풀 문제들. 서버가 방을 만들 때 한 번 뽑고 그 뒤로 바뀌지 않는다.
  deck: ArchqDeckItem[];
  /// 문항 모드에서 지금 다 같이 보고 있는 문항 번호.
  q: number;
  /// 지금 문항이 화면에서 0이 되는 시각. 여기에 ARCHQ_GRACE_MS 를 더한 때까지 답을 받는다.
  dl: number;
  /// 타임어택에서 방 전체가 나눠 쓰는 시계가 끝나는 시각.
  ends: number;
  startedAt: number;
  endedAt: number;
  /// 참가자. 키는 계정 id 다.
  ps: Record<string, ArchqPlayer>;
  /// 답. 키는 "문항번호|계정id" 다. 한 칸씩 더해야 같은 순간의 답이 서로를 덮지 않는다.
  ans: Record<string, ArchqAnswer>;
  ts: number;
  v: number;
}

/**
 * 방에서 쓸 이름을 다듬는다.
 *
 * 줄바꿈이나 제어문자를 정규식 문자 클래스 대신 코드포인트로 거른다. 소스에 제어문자를
 * 직접 적으면 파일이 바이너리로 취급되어 편집기와 도구가 다루기 어려워진다.
 * 순위표에 그대로 나가는 글자라 길이도 여기서 자른다.
 */
export function roomNick(raw: unknown, fallback: string): string {
  const s = [...(typeof raw === "string" ? raw : "")]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 32 && c !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8);
  return s || fallback.slice(0, 12);
}

export function isArchqState(state: unknown): state is ArchqRoomState {
  return Boolean(state) && typeof state === "object" && (state as { game?: unknown }).game === "archq";
}

export function answerKey(q: number, userId: string): string {
  return `${q}|${userId}`;
}

/// 타임어택인가. 이 한 줄로 갈리는 것이 많아 따로 둔다.
export function isTimed(st: ArchqRoomState): boolean {
  return ARCHQ_MODES[st.mode].secs > 0;
}

/**
 * 이 사람이 지금 풀어야 할 문항 번호.
 *
 * 문항 모드는 방이 다 같이 한 문항을 본다. 타임어택은 시계 하나만 나눠 쓰고 진도는
 * 각자 나간다 - 빠른 사람이 느린 사람을 기다리면 "제한 시간 안에 몇 개" 라는 말이
 * 성립하지 않고, 모두가 같은 개수를 푸는 문항 모드와 다를 게 없어진다.
 */
export function cursorOf(st: ArchqRoomState, userId: string): number {
  if (!isTimed(st)) return st.q;
  let n = 0;
  for (let i = 0; i < st.deck.length; i++) if (st.ans[answerKey(i, userId)]) n++;
  return n;
}

/**
 * 어디까지가 이미 공개된 문항인가.
 *
 * 문항 모드에서 지금 열려 있는 문항은 여기 들어오지 않는다. 점수가 답하는 즉시 오르면
 * 맞혔다는 사실이 그 자리에서 드러나고, 같은 방에 모여 하는 게임이라 그 한마디가
 * 그대로 남에게 넘어간다. 그래서 점수도 마감 뒤에 함께 오른다.
 *
 * 타임어택은 각자 진도를 나가고 답한 즉시 정답을 보므로 가릴 것이 없다.
 */
function revealedUpTo(st: ArchqRoomState): number {
  if (isTimed(st) || st.ph === "end") return st.deck.length;
  return Math.min(st.q, st.deck.length);
}

function tallyOf(st: ArchqRoomState, userId: string, upTo: number) {
  let score = 0;
  let answered = 0;
  let ms = 0;
  let last = 0;
  for (let i = 0; i < upTo; i++) {
    const a = st.ans[answerKey(i, userId)];
    if (!a) continue;
    answered++;
    score += a.k;
    ms += a.ms;
    if (a.t > last) last = a.t;
  }
  return { score, answered, ms, last };
}

/// 지금 문항에 답한 사람들. 방에 없는(나간) 사람의 답은 세지 않는다.
export function answeredNow(st: ArchqRoomState): string[] {
  return Object.keys(st.ps).filter((id) => st.ans[answerKey(st.q, id)]);
}

/**
 * 최종 순위.
 *
 * 많이 맞힌 사람이 위, 같으면 빨리 답한 사람이 위다. 솔로 순위표(ArchqScore)와 같은
 * 기준이지만 그 표에는 한 줄도 쌓지 않는다. 방 점수를 개인 최고 기록에 섞으면, 여럿이
 * 짜고 한 사람에게 정답을 불러 주는 것만으로 순위표 1위를 만들 수 있다. 방은 방에서
 * 끝나야 한다.
 */
export function boardOf(st: ArchqRoomState, meId: string | null) {
  const upTo = revealedUpTo(st);
  const rows = Object.entries(st.ps).map(([id, p]) => {
    const t = tallyOf(st, id, upTo);
    return { id, name: p.n, score: t.score, answered: t.answered, ms: t.ms, me: id === meId };
  });
  rows.sort((x, y) => y.score - x.score || x.ms - y.ms || x.name.localeCompare(y.name));
  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    score: r.score,
    answered: r.answered,
    secs: Math.round(r.ms / 100) / 10,
    me: r.me,
  }));
}

/**
 * 시간이 지났거나 모두 답했으면 다음으로 넘긴다.
 *
 * 호스트의 브라우저가 진행을 맡으면, 그 사람이 창을 닫는 순간 방이 그 문항에서 멈춘다.
 * 그래서 진행은 서버가 판단하고, 아무나 상태를 물어볼 때 밀린 만큼 넘긴다. expect 를
 * 붙이는 것은 동시에 들어온 폴링 둘이 같은 문항을 두 번 넘기지 못하게 하기 위해서다.
 *
 * 한 번에 한 칸만 넘긴다. 탭이 잠들어 몇 분 뒤에 돌아오면 밀린 문항을 한꺼번에 건너뛰게
 * 되는데, 그러면 아무도 보지 못한 문항이 오답으로 쌓인다. 한 칸씩 가면 돌아온 사람도
 * 다음 문항부터 제대로 푼다.
 */
export function progressPatch(st: ArchqRoomState, now: number): RoomStatePatch | null {
  if (st.ph !== "play") return null;

  if (isTimed(st)) {
    if (now < st.ends) return null;
    return { set: { ph: "end", endedAt: now }, expect: { ph: "play" } };
  }

  const everyone = Object.keys(st.ps).length > 0 && answeredNow(st).length >= Object.keys(st.ps).length;
  if (!everyone && now < st.dl + ARCHQ_GRACE_MS) return null;

  const next = st.q + 1;
  if (next >= st.deck.length) {
    return { set: { ph: "end", endedAt: now, q: next }, expect: { ph: "play", q: st.q } };
  }
  return { set: { q: next, dl: now + ARCHQ_QUESTION_MS }, expect: { ph: "play", q: st.q } };
}

/// progressPatch 가 만든 지시를 메모리에도 반영한다. 방금 쓴 값을 다시 읽지 않으려고 쓴다.
export function applyPatch(st: ArchqRoomState, patch: RoomStatePatch): ArchqRoomState {
  return { ...st, ...(patch.set as Partial<ArchqRoomState>) };
}

/**
 * 방을 읽어 설계자 맞히기 방인지 확인한다.
 *
 * 밸런스 방과 같은 Room 표를 쓰므로, 코드만 보고 이쪽 규칙을 적용하면 남의 게임 상태를
 * 이 게임의 규칙으로 고치게 된다. 그래서 두 곳 모두 game 표시를 먼저 본다.
 */
export async function loadArchqRoom(
  code: string
): Promise<{ room: RoomRecord; st: ArchqRoomState } | "missing" | "other"> {
  const room = await store().getRoom(code);
  if (!room) return "missing";
  if (!isArchqState(room.state)) return "other";
  return { room, st: room.state };
}

/// 밀린 진행을 넘긴다. 이미 다른 요청이 넘겼으면 그쪽이 쓴 상태를 다시 읽어 온다.
export async function tickArchq(code: string, st: ArchqRoomState, now = Date.now()): Promise<ArchqRoomState> {
  const patch = progressPatch(st, now);
  if (!patch) return st;
  if (await store().patchRoomState(code, patch)) return applyPatch(st, patch);
  const fresh = await store().getRoom(code);
  return fresh && isArchqState(fresh.state) ? fresh.state : st;
}

/**
 * 브라우저에게 보여 줄 수 있는 만큼만 추린다.
 *
 * 여기가 이 파일에서 가장 중요한 함수다. 상태를 그대로 내려보내면 네트워크 탭을 한 번
 * 여는 것으로 남은 문제 전부가 순서까지 나온다. 그러면 그 방의 점수는 아무 의미가 없다.
 * 그래서 지금 풀 문항 하나와, 이미 지나간 문항의 정답만 나간다.
 */
export function archqView(input: {
  st: ArchqRoomState;
  code: string;
  playerCount: number;
  maxPlayers: number;
  expiresAt: Date;
  hostId: string | null;
  meId: string | null;
  /// 지나간 문항의 정답을 알려주려면 은행이 필요하다. 없으면 정답 없이 보낸다.
  rightOf?: (deckIndex: number) => number | null;
}) {
  const { st, meId } = input;
  const mode = ARCHQ_MODES[st.mode];
  const joined = Boolean(meId && st.ps[meId]);

  const base = {
    game: "archq" as const,
    code: input.code,
    ph: st.ph,
    mode: st.mode,
    lang: st.lang,
    open: st.open,
    total: st.deck.length,
    secs: mode.secs || null,
    endsAt: isTimed(st) && st.ph === "play" ? st.ends : null,
    playerCount: input.playerCount,
    maxPlayers: input.maxPlayers,
    expiresAt: input.expiresAt,
    host: Boolean(meId && input.hostId === meId),
    joined,
    players: Object.keys(st.ps).length,
    ts: st.ts,
  };

  // 들어오지 않은 사람에게는 방이 어떤 상태인지까지만 알려 준다. 입장 화면이 "이미
  // 시작했어요" 를 띄우려면 그 정도는 있어야 하고, 그 이상은 알 이유가 없다.
  if (!joined || !meId) return base;

  const cursor = cursorOf(st, meId);
  const mine = tallyOf(st, meId, revealedUpTo(st));
  const cur = st.ph === "play" && cursor < st.deck.length ? st.deck[cursor] : null;
  const answeredCur = cur ? st.ans[answerKey(cursor, meId)] : undefined;

  /* 지나간 문항의 정답. 문항 모드에서는 마감이 지나야 여기 실리므로, 먼저 답한 사람이
     정답을 미리 알고 옆 사람에게 알려주는 일이 생기지 않는다. 같은 자리에 앉아 하는
     게임이라 이게 실제로 문제가 된다. */
  const prevIdx = cursor - 1;
  const prev =
    prevIdx >= 0 && prevIdx < st.deck.length
      ? {
          i: prevIdx,
          b: st.deck[prevIdx].b,
          right: input.rightOf ? input.rightOf(prevIdx) : null,
          pick: st.ans[answerKey(prevIdx, meId)]?.p ?? null,
          ok: st.ans[answerKey(prevIdx, meId)]?.k === 1,
        }
      : null;

  return {
    ...base,
    q: st.ph === "lobby" ? null : cursor,
    deadline: !isTimed(st) && st.ph === "play" ? st.dl : null,
    question: cur ? { i: cursor, b: cur.b, opts: cur.o } : null,
    /// 지금 문항에 몇 명이 답했는가. 타임어택은 각자 진도가 달라 뜻이 없으므로 비운다.
    answeredCount: isTimed(st) ? null : answeredNow(st).length,
    answered: isTimed(st)
      ? null
      : answeredNow(st).map((id) => st.ps[id]?.n ?? "?"),
    me: {
      name: st.ps[meId].n,
      score: mine.score,
      answered: mine.answered,
      secs: Math.round(mine.ms / 100) / 10,
      /// 지금 문항에 이미 답했는가. 답을 무엇으로 했는지는 마감 전에 알려주지 않는다.
      waiting: Boolean(answeredCur),
      done: cursor >= st.deck.length,
    },
    prev,
    board: boardOf(st, meId),
  };
}
