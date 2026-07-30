import { BANK_SIZE } from "./bank";

export const ROUND_LENGTHS = [10, 20, 30] as const;
export type RoundLength = (typeof ROUND_LENGTHS)[number];
export const DEFAULT_ROUND_LENGTH: RoundLength = 20;

/// 방 유효기간 24시간 — 원본 ROOM_TTL 과 동일.
export const ROOM_TTL_MS = 24 * 3600 * 1000;

/// 중복 없는 랜덤 출제. 원본과 동일하게 Fisher–Yates 로 전체를 섞고 앞에서 n개를 취한다.
/// (앞에서부터 뽑기 때문에 문항 수를 바꿔도 분포가 치우치지 않는다.)
export function drawRound(n: number = DEFAULT_ROUND_LENGTH, size: number = BANK_SIZE): number[] {
  const count = Math.max(1, Math.min(Math.floor(n), size));
  const idxs = Array.from({ length: size }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, count);
}

/// 방에서 내려온 출제 목록을 신뢰하기 전에 정리한다.
/// 범위를 벗어난 값은 버리고, 중복도 제거해 같은 문항이 두 번 나오지 않게 한다.
export function sanitizeRound(seed: unknown, size: number = BANK_SIZE): number[] | null {
  if (!Array.isArray(seed)) return null;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of seed) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= size || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out.length ? out : null;
}

/// 4자리 방 코드. 서버에서 생성하며 충돌 시 재추첨한다.
export function makeRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
