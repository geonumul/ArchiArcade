/**
 * 이메일 정규화와 형식 검사.
 *
 * 완벽한 이메일 정규식은 없고, 있어도 도움이 안 된다 — 진짜 검증은 코드를 보내서
 * 받는지 확인하는 것뿐이다. 여기서는 명백한 오타와 저장을 어지럽히는 입력만 걸러낸다.
 */

/// 대소문자와 앞뒤 공백 차이로 같은 주소가 두 계정이 되는 것을 막는다.
/// 점 제거나 +태그 제거 같은 제공자별 규칙은 적용하지 않는다 — 표준이 아니고,
/// 학교 메일에서는 실제로 다른 사람일 수 있다.
export function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export function validEmail(email: string): boolean {
  if (email.length < 6 || email.length > 254) return false;
  // 공백 없이 로컬@도메인.최상위 한 벌. 연속된 점이나 끝의 점은 받지 않는다.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return false;
  if (email.includes("..")) return false;
  return true;
}

/// 화면이나 로그에 남길 때 쓰는 가림 처리. 앞 두 글자와 도메인만 남긴다.
export function maskEmail(email: string): string {
  return email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
}
