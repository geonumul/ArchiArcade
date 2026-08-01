/**
 * 설계자 맞히기("이 건물 누가 설계했게")의 서버 쪽 문제 은행.
 *
 * 화면이 읽는 은행은 public/quiz-architect.js 하나뿐이고, 서버도 같은 파일을 읽는다.
 * 서버용 사본을 따로 두면 언젠가 한쪽만 고쳐지고, 그 순간 방이 낸 문제와 서버가
 * 채점하는 정답이 어긋난다. 건물 번호가 곧 문제이므로 한 칸만 밀려도 전부 오답이 된다.
 *
 * 이름 표기(ko/ja/zh/tw/la)는 일부러 읽지 않는다. 서버가 하는 일은 무엇을 낼지 정하고
 * 맞았는지 판정하는 것뿐이고, 이름은 브라우저가 자기 은행에서 꺼내 쓴다. 그래야 응답이
 * 가볍고, 아홉 언어의 표기를 서버가 알아야 할 이유도 생기지 않는다.
 *
 * 엔드포인트는 없다. app/api/rooms/archq/* 가 쓰는 라이브러리다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/// 서버가 실제로 쓰는 것만 추린 건물 한 채.
export interface ArchqBuilding {
  /// 설계자. 은행 arch 배열의 인덱스이며 이것이 정답이다.
  a: number;
  /// 준공 연도. 오답을 고를 때 연대 비교에 쓴다.
  y: number;
  /// 두 글자 ISO 국가 코드.
  c: string;
}

export interface ArchqBank {
  /// 설계자 수. 보기는 이 범위의 인덱스로만 이루어진다.
  archCount: number;
  bld: ArchqBuilding[];
  /// 나라별로 그 나라에 건물을 가진 설계자들. 같은 나라 오답을 고를 때 쓴다.
  byCountry: Map<string, number[]>;
  /// 설계자의 대표 연대(그 사람 건물들의 준공 연도 평균).
  era: Map<number, number>;
}

/**
 * 한 문항이 열려 있는 시간. 솔로의 AQ_SEC(12초)과 같은 값이다.
 *
 * 방이라고 더 주거나 덜 주면 같은 게임이 아니게 된다. 혼자 12초에 풀던 사람이
 * 방에서는 다른 감각으로 풀게 되고, 두 기록을 나란히 놓고 이야기할 수 없다.
 */
export const ARCHQ_QUESTION_MS = 12_000;

/**
 * 마감 뒤에도 이만큼은 늦은 답을 받아 준다.
 *
 * 화면의 시계가 0이 되는 순간 눌러도 요청이 서버에 닿기까지는 시간이 걸린다. 그 차이를
 * 봐 주지 않으면 회선이 느린 사람만 매번 시간 초과가 되는데, 그건 실력이 아니다.
 * 다음 문항으로 넘어가는 시점도 이 시간이 지난 뒤여야 한다. 넘어간 뒤에 도착한 답은
 * 지난 문항의 답이라 받을 자리가 없기 때문이다.
 */
export const ARCHQ_GRACE_MS = 1_500;

/// 오답 셋 중 같은 나라 사람은 한 명까지. 원본 index.html 의 AQ_SAME_COUNTRY 와 같다.
const SAME_COUNTRY = 1;

/// 연대가 이만큼 안에 있으면 "비슷한 시대" 로 본다. 원본과 같은 35년이다.
const ERA_SPAN = 35;

export const ARCHQ_MODES = {
  q10: { n: 10, secs: 0 },
  q20: { n: 20, secs: 0 },
  q30: { n: 30, secs: 0 },
  t60: { n: 0, secs: 60 },
  t120: { n: 0, secs: 120 },
} as const;

export type ArchqModeId = keyof typeof ARCHQ_MODES;

export function isArchqMode(v: unknown): v is ArchqModeId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ARCHQ_MODES, v);
}

/**
 * 그 모드에 몇 문항을 뽑아 둘 것인가.
 *
 * 타임어택은 몇 문항을 풀지 미리 알 수 없으므로 넉넉히 뽑는다. 계산식은 원본
 * index.html 의 aqStart 와 같은 값을 쓴다 - 방에서만 덱 길이가 다르면 같은 60초인데
 * 방에서는 문제가 모자라 먼저 끝나는 일이 생긴다.
 */
export function archqDeckSize(mode: ArchqModeId, bankSize: number): number {
  const m = ARCHQ_MODES[mode];
  const want = m.secs ? Math.min(120, Math.max(40, Math.floor(m.secs / 1.5))) : m.n;
  return Math.max(1, Math.min(want, bankSize));
}

/// 덱 한 칸. 정답을 따로 적지 않는 이유는 bld[b].a 가 곧 정답이고, 그것을 상태에
/// 한 번 더 적어 두면 방 상태를 흘깃 보는 것만으로 정답표가 되기 때문이다.
export interface ArchqDeckItem {
  /// 건물. 은행 bld 배열의 인덱스다.
  b: number;
  /// 보기 네 개. 은행 arch 배열의 인덱스이며 순서가 곧 화면에 뜨는 순서다.
  o: number[];
}

// ── 은행 읽기 ────────────────────────────────────────────────

let cached: ArchqBank | null = null;

/**
 * 은행을 읽어 둔다. 실패하면 null 을 돌려주고, 부르는 쪽이 503 으로 답한다.
 *
 * 원본 파일은 window.ARCHQ 에 대입하는 스크립트라 그대로 실행해 값을 꺼낸다.
 * scripts/merge-archq-bank.mjs 가 쓰는 방법과 같다. 우리가 쓴 파일 하나를 우리가
 * 읽는 것이라 밖에서 들어온 코드를 실행하는 일은 일어나지 않는다.
 */
export function archqBank(): ArchqBank | null {
  if (cached) return cached;
  let raw: { arch?: unknown[]; bld?: Record<string, unknown>[] } | undefined;
  try {
    const src = readFileSync(path.join(process.cwd(), "public", "quiz-architect.js"), "utf8");
    const holder: { ARCHQ?: { arch?: unknown[]; bld?: Record<string, unknown>[] } } = {};
    new Function("window", src)(holder);
    raw = holder.ARCHQ;
  } catch {
    return null;
  }
  if (!raw || !Array.isArray(raw.arch) || !Array.isArray(raw.bld) || !raw.bld.length) return null;

  const bld: ArchqBuilding[] = [];
  const byCountry = new Map<string, Set<number>>();
  const sum = new Map<number, { s: number; n: number }>();

  for (const row of raw.bld) {
    const a = Number(row.a);
    const y = Number(row.y);
    const c = String(row.c ?? "");
    if (!Number.isInteger(a) || a < 0 || a >= raw.arch.length) return null;
    bld.push({ a, y, c });
    const set = byCountry.get(c) ?? new Set<number>();
    set.add(a);
    byCountry.set(c, set);
    const e = sum.get(a) ?? { s: 0, n: 0 };
    e.s += y;
    e.n += 1;
    sum.set(a, e);
  }

  const era = new Map<number, number>();
  for (const [a, e] of sum) era.set(a, e.s / e.n);

  cached = {
    archCount: raw.arch.length,
    bld,
    byCountry: new Map([...byCountry].map(([c, set]) => [c, [...set]])),
    era,
  };
  return cached;
}

// ── 출제 ────────────────────────────────────────────────────

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 오답 셋을 고른다. 원본 index.html 의 aqWrong 을 그대로 옮긴 것이다.
 *
 * 아무나 뽑으면 문제가 되지 않는다. 부여박물관 문제에 유럽 사람 셋이 나오면 한국
 * 이름 하나만 찾으면 되고, 반대로 셋 다 같은 나라에서 뽑으면 아는 사람만 푸는 문제가
 * 된다. 그래서 같은 나라는 한 명까지만 넣고, 나머지는 연대가 가까운 사람으로 메우며,
 * 그래도 모자랄 때만 아무나 넣는다.
 *
 * 규칙이 화면과 조금이라도 다르면 방에서만 난이도가 달라진다. 같은 게임이라고 부를 수
 * 없게 되므로, 고칠 일이 생기면 두 곳을 같이 고쳐야 한다.
 */
export function archqWrong(bank: ArchqBank, b: ArchqBuilding): number[] {
  const out: number[] = [];
  const take = (pool: number[], lim = 3) => {
    for (const a of shuffle([...pool])) {
      if (out.length < lim && a !== b.a && out.indexOf(a) < 0) out.push(a);
    }
  };
  const all = Array.from({ length: bank.archCount }, (_, i) => i);

  take(bank.byCountry.get(b.c) ?? [], SAME_COUNTRY);
  if (out.length < 3) {
    const mine = bank.era.get(b.a) ?? b.y;
    take(all.filter((a) => Math.abs((bank.era.get(a) ?? 0) - mine) <= ERA_SPAN));
  }
  if (out.length < 3) take(all);
  return out;
}

/**
 * 방 하나가 쓸 덱을 뽑는다.
 *
 * 이것을 서버가 하는 것이 이 게임을 방에서 하는 유일한 이유다. 브라우저가 각자 뽑으면
 * 같은 방에 앉아 서로 다른 문제를 푸는 것이고, 그렇게 나온 점수는 나란히 놓을 수 없다.
 */
export function drawArchqDeck(bank: ArchqBank, n: number): ArchqDeckItem[] {
  const pick = shuffle(bank.bld.map((_, i) => i)).slice(0, Math.max(1, Math.min(n, bank.bld.length)));
  return pick.map((bi) => {
    const b = bank.bld[bi];
    return { b: bi, o: shuffle([b.a, ...archqWrong(bank, b)]) };
  });
}
