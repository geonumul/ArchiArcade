/**
 * 설계실 라이어게임 - 방 상태와 판정.
 *
 * 다들 같은 제시어를 받는데 한 명만 다른 단어를 받는다. 제시어는 잠깐 떴다가 사라지고,
 * 그 뒤로는 각자 아는 척하며 이야기한다. 시간이 끝나면 라이어를 지목하고, 지목당한
 * 라이어에게는 진짜 제시어를 맞힐 기회가 한 번 남는다.
 *
 * 이 게임은 대화가 전부다. 그래서 방은 언어별로 나눈다 - 단서의 말투로 사람을 잡는
 * 게임인데 기계 번역이 끼면 그 말투가 사라져서 게임 자체가 성립하지 않는다.
 * 제시어 은행을 9개 언어로 따로 두는 것도 그 때문이다.
 *
 * 무엇을 서버가 쥐고 있어야 하는가:
 *   - 누가 라이어인지. 브라우저에 내려보내면 개발자 도구로 바로 보인다.
 *   - 남의 제시어. 자기 것만 받는다. 라이어에게는 가짜만, 나머지에게는 진짜만.
 *   - 남은 시간. 브라우저 시계를 믿으면 한 사람만 시간을 늘려 잡을 수 있다.
 */

/// 상태 형식 번호. 모양을 바꾸면 올린다. 살아 있는 방은 옛 모양으로 끝까지 간다.
export const LIAR_STATE_V = 1;

/// 제시어가 화면에 머무는 시간.
///
/// 처음에는 3초로 잡았는데, 단어만 있으면 몰라도 설명까지 읽으려면 그 안에 안 된다.
/// 설명을 못 읽고 넘어가면 아는 척할 거리가 없어 그대로 굳어 버린다. 10초면 읽고
/// 한 번 더 볼 만하되, 받아 적고 앉아 있을 만큼 길지는 않다.
/// 줄어드는 것을 화면에 보여 준다 - 언제 사라지는지 모르면 읽다 말고 놓친다.
export const LIAR_REVEAL_MS = 10_000;
/// 이야기 시간. 방장이 고른다.
export const LIAR_TALK_CHOICES = [120, 180, 300] as const;
/// 지목 시간.
export const LIAR_VOTE_MS = 45_000;
/// 라이어가 제시어를 맞힐 시간.
export const LIAR_GUESS_MS = 30_000;

/// 시작에 필요한 인원. 넷은 되어야 지목이 한쪽으로 몰리지 않고, 열둘이 넘으면
/// 한 사람이 말할 틈이 없다.
export const LIAR_MIN = 4;
export const LIAR_MAX = 12;

/// 모르는 사람과 하는 방은 넷으로 고정한다. 고를 수 있게 하면 여덟 명짜리 방을
/// 열어 놓고 아무도 안 와서 계속 기다리게 되는데, 처음 온 사람은 그게 자기 선택
/// 때문인 줄 모른다. 넷은 사람이 가장 빨리 차는 수다.
export const LIAR_MATCH_NEED = 4;

export interface LiarPlayer {
  /// 방에서 쓰는 이름.
  n: string;
  j: number;
}

export interface LiarState {
  /// 다른 게임의 방과 섞이지 않게 하는 표시. 같은 Room 표를 쓴다.
  game: "liar";
  ph: "lobby" | "reveal" | "talk" | "vote" | "guess" | "result";
  lang: string;
  /// 시작에 필요한 인원. 방장이 정한다.
  need: number;
  /// 이야기 시간(초).
  talk: number;
  /// 시작한 뒤에도 들어올 수 있는가. 라이어게임은 판이 시작되면 못 들어온다 -
  /// 중간에 들어온 사람은 제시어를 못 봐서 자동으로 라이어처럼 보인다.
  open: boolean;

  /// 제시어 번호. 은행의 자리이고, 브라우저에는 자기가 볼 것만 골라 내려간다.
  wi: number;
  /// 라이어의 계정 id. 밖으로 내보내지 않는다.
  liar: string;

  ps: Record<string, LiarPlayer>;
  /// 지목. 투표한 사람 id -> 지목당한 사람 id.
  votes: Record<string, string>;
  /// 라이어가 마지막에 고른 제시어 번호. 아직 안 골랐으면 null.
  guess: number | null;

  /// 지금 단계가 끝나는 시각.
  until: number;
  startedAt: number;
  ts: number;
  v: number;
}

/// 방에서 쓸 이름을 다듬는다. 제어문자를 문자 클래스가 아니라 코드포인트로 거른다 -
/// 소스에 제어문자를 직접 적으면 파일이 바이너리로 취급된다.
export function liarNick(raw: string, fallback: string): string {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c === 127) continue;
    out += ch;
  }
  out = out.replace(/\s+/g, " ").trim().slice(0, 10);
  return out || fallback;
}

export function isTalkLen(n: unknown): n is number {
  return (LIAR_TALK_CHOICES as readonly number[]).includes(Number(n));
}

export function isNeed(n: unknown): boolean {
  const v = Number(n);
  return Number.isInteger(v) && v >= LIAR_MIN && v <= LIAR_MAX;
}

/**
 * 지목 결과.
 *
 * 가장 많이 지목당한 사람을 잡는다. 동점이면 아무도 안 잡힌 것으로 본다 - 동점을
 * 임의로 갈라 한 명을 잡으면, 걸린 사람은 자기가 왜 걸렸는지 알 수 없다.
 */
export function tally(st: LiarState): { top: string | null; counts: Record<string, number>; tie: boolean } {
  const counts: Record<string, number> = {};
  for (const target of Object.values(st.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  let top: string | null = null;
  let best = 0;
  let tie = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      top = id;
      tie = false;
    } else if (n === best) {
      tie = true;
    }
  }
  return { top: tie ? null : top, counts, tie };
}

/**
 * 승패.
 *
 * 라이어를 못 잡으면 라이어가 이긴다. 잡아도 라이어가 진짜 제시어를 맞히면 라이어가
 * 이긴다 - 끝까지 듣고 있었다는 뜻이라, 그 한 방을 남겨 두는 편이 판이 재미있다.
 */
export function outcome(st: LiarState): { caught: boolean; liarWon: boolean } {
  const { top } = tally(st);
  const caught = top === st.liar;
  if (!caught) return { caught: false, liarWon: true };
  return { caught: true, liarWon: st.guess === st.wi };
}

/**
 * 한 사람에게 보낼 상태.
 *
 * 라이어가 누구인지와 남의 제시어는 절대 넣지 않는다. 결과 단계가 되어서야 함께 나간다.
 */
export function liarView(input: {
  st: LiarState;
  code: string;
  playerCount: number;
  maxPlayers: number;
  hostId: string | null;
  meId: string | null;
}) {
  const { st, meId } = input;
  const joined = Boolean(meId && st.ps[meId]);
  const done = st.ph === "result";

  const base = {
    game: "liar" as const,
    code: input.code,
    ph: st.ph,
    lang: st.lang,
    need: st.need,
    talk: st.talk,
    open: st.open,
    players: Object.keys(st.ps).length,
    maxPlayers: input.maxPlayers,
    host: Boolean(meId && input.hostId === meId),
    joined,
    until: st.until || null,
    ts: st.ts,
  };

  // 들어오지 않은 사람에게는 방이 어떤 상태인지까지만 알려 준다.
  if (!joined || !meId) return base;

  const roster = Object.entries(st.ps).map(([id, p]) => ({
    id,
    name: p.n,
    me: id === meId,
    /// 지목했는지만 알려 준다. 누구를 지목했는지는 결과 전까지 감춘다 - 먼저 던진
    /// 표를 보고 나머지가 따라가면 지목이 아니라 눈치 싸움이 된다.
    voted: Boolean(st.votes[id]),
  }));

  return {
    ...base,
    /// 내가 받은 제시어. 라이어에게는 가짜가 간다. 무엇이 가짜인지는 알려주지 않는다.
    myWord: st.ph === "lobby" ? null : st.wi,
    /// 내가 라이어인가. 본인에게만 알려 준다.
    imLiar: st.ph === "lobby" ? false : meId === st.liar,
    roster,
    voted: st.votes[meId] ?? null,
    result: done
      ? {
          liar: st.liar,
          liarName: st.ps[st.liar]?.n ?? "?",
          word: st.wi,
          guess: st.guess,
          votes: st.votes,
          ...outcome(st),
        }
      : null,
  };
}

/**
 * 언어마다 "지금 사람을 모으는 중인 방" 을 가리키는 칸.
 *
 * 모르는 사람과 하기를 누를 때마다 방 목록을 통째로 훑으면, 방이 많아졌을 때 사람을
 * 못 만나는 것보다 그쪽이 먼저 문제가 된다. 언어별로 한 칸만 보고 간다.
 */
export function liarWaitingKey(lang: string): string {
  return "arcade-liarwait-" + lang;
}
