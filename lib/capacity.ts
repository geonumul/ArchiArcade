/**
 * 방 정원.
 *
 * 호스트가 방을 만들 때 정원을 고르고, 다 차면 새로 들어오려는 사람에게 알린다.
 *
 * 상한(MAX_PLAYERS_PER_ROOM)이 있는 이유는 취향이 아니라 구조다. 참가자는 방 상태를
 * 주기적으로 물어보므로 요청량이 인원에 비례해 늘고, 폴링을 실시간(STEP 5)으로 바꾸기
 * 전까지는 무료 티어가 먼저 한계에 닿는다. 그래서 서비스가 멈추는 대신 "정원이 찼다"고
 * 말해주는 쪽을 택했다. 이 숫자를 올리려면 실시간 전환이 먼저다.
 */
export const ROOM_SIZES = [10, 20, 30, 50] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];
export const DEFAULT_ROOM_SIZE: RoomSize = 30;

/// 호스트가 고를 수 있는 최댓값.
export const MAX_PLAYERS_PER_ROOM = 50;

/// 서비스 전체 동시 참가자 안전장치. 눈에 보이는 기능은 아니고,
/// 여러 방이 동시에 열려 무료 티어 한도를 넘기는 상황을 막는 마지막 방어선이다.
export const MAX_CONCURRENT_PLAYERS = 200;

/// 이 시간 안에 상태가 바뀐 방만 "살아있다"고 본다. 호스트가 창을 닫아버린 방이
/// 전체 정원을 영원히 붙들고 있는 것을 막는다.
export const ACTIVE_WINDOW_MIN = 30;

export function isRoomSize(v: unknown): v is RoomSize {
  return typeof v === "number" && (ROOM_SIZES as readonly number[]).includes(v);
}
