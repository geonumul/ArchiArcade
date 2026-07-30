/**
 * 원본 index.html 의 `window.storage` 를 받아 주는 공용 키-값 저장소.
 *
 * 화면은 원본 그대로 두기로 했으므로, 원본이 부르는 인터페이스를 서버가 맞춰 준다.
 * 다만 이 저장소는 로그인 없이 누구나 쓸 수 있는 공용 공간이라, 다음 셋으로 가둔다.
 *   1. 키 허용목록  — 원본이 실제로 쓰는 접두사 밖은 아예 받지 않는다
 *   2. 값 크기 상한 — 한 키가 DB 를 통째로 먹는 것을 막는다
 *   3. 수명         — 방 관련 키는 24시간 뒤 만료로 표시한다(원본 ROOM_TTL 과 동일)
 */

/// 원본 ROOM_TTL 과 같은 값. 이 둘이 어긋나면 방이 화면에는 살아 있는데
/// 저장소에는 없는 상태가 생긴다.
export const ROOM_TTL_MS = 24 * 3600 * 1000;

/// 값 하나의 상한. 가장 큰 키는 아이디어/신고 목록(최근 80건)이라 넉넉히 잡았다.
export const MAX_VALUE_BYTES = 128 * 1024;

/// list() 가 한 번에 돌려주는 최대 개수. 원본은 로비에서 60개까지만 읽는다.
export const MAX_LIST_KEYS = 400;

/**
 * 원본이 쓰는 키 전부. 여기 없는 키는 400 으로 돌려보낸다.
 * 새 키를 원본에 추가하면 여기도 같이 늘려야 한다.
 */
const KEY_RULES: RegExp[] = [
  // 전역 카운터·게시판·반응·관심도: arcade-stats-v1, arcade-ideas-v1, …
  /^arcade-[a-z0-9-]{1,40}$/,
  // 154문항 전역 투표 집계: archbal-bank-v4
  /^archbal-bank-v[0-9]{1,3}$/,
  // 방: abg2-1234-st / abg2-1234-j-<uid>-<name> / abg2-1234-v3g0-<uid>-a
  /^abg2-[A-Za-z0-9]{1,12}-[A-Za-z0-9%._~-]{1,180}$/,

  // 회원(abg-user-<닉네임>)은 의도적으로 빼 두었다.
  //
  // 원본은 비밀번호 해시·salt·반복횟수를 이 키에 담아 공용 저장소에 넣었고, 이 API 는
  // 누구에게나 열려 있으므로 남의 닉네임만 알면 그 해시를 그대로 받아 오프라인에서
  // 대입 공격을 할 수 있었다. 계정은 서버(/api/auth/*)로 옮겼고, 이 키는 다시
  // 허용하지 않는다 — 허용하는 순간 같은 구멍이 다시 열린다.
];

export function isAllowedKey(key: string): boolean {
  if (!key || key.length > 240) return false;
  return KEY_RULES.some((re) => re.test(key));
}

/**
 * 접두사 조회는 키 하나를 읽는 것보다 비싸므로 더 좁게 받는다.
 * 원본이 접두사로 읽는 것은 방의 참가자 목록과 투표뿐이다.
 */
export function isAllowedPrefix(prefix: string): boolean {
  return /^abg2-[A-Za-z0-9]{1,12}-[A-Za-z0-9%._~-]{0,40}$/.test(prefix);
}

/// 방 관련 키만 수명을 갖는다. 나머지는 영구 — 전역 집계라 지우면 안 된다.
export function expiryFor(key: string, now: number): Date | null {
  return key.startsWith("abg2-") ? new Date(now + ROOM_TTL_MS) : null;
}

/// Postgres LIKE 에서 접두사를 그대로 쓰려면 와일드카드를 막아야 한다.
export function likePrefix(prefix: string): string {
  return prefix.replace(/([%_\\])/g, "\\$1") + "%";
}
