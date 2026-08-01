/**
 * 쿠팡 파트너스 링크.
 *
 * lptag 가 수수료를 잡는 유일한 열쇠다. 이 값이 빠진 링크는 그냥 쿠팡으로 사람을
 * 보내 주기만 하고 한 푼도 안 잡힌다 - 그래서 링크를 손으로 적지 않고 전부 여기를
 * 거치게 한다. 한 군데서만 붙이면 빠뜨릴 자리가 없다.
 *
 * 이 태그는 비밀이 아니다. 밖으로 나가는 모든 링크의 주소창에 그대로 보이는 값이라
 * .env 로 숨길 대상이 아니고, 숨겨도 의미가 없다. (숨겨야 하는 것은 파트너스
 * 계정 비밀번호와 API 키 쪽이며, 그건 이 파일에 없다.)
 *
 * subid 는 어느 자리에서 눌렸는지 구분하는 칸이다. 이게 없으면 정산 화면에 "쿠팡
 * 파트너스 수익 얼마" 한 줄만 남아서, 무엇이 팔려서 들어온 돈인지 알 수 없다.
 * 무엇이 팔리는지 모르면 다음에 무엇을 더 놓을지도 정할 수 없다.
 */

export const COUPANG_TAG = "AF1963928";

/**
 * 대가성 문구. 파트너스 이용 가이드(2024-07-16) 48쪽의 표준 문구를 글자 그대로 쓴다.
 *
 * 바꿔 쓰지 않는 이유: 같은 쪽이 "의도적으로 불명확하게 표시" 를 서비스 해지 사유로
 * 들고 있고, 무엇이 불명확한지는 공정위 심사지침이 정하지 뿐 우리가 정하지 않는다.
 * 표준 문구를 그대로 쓰면 그 판단에 걸릴 자리가 없다.
 *
 * 49쪽이 드는 위반 사례 넷도 같이 피해야 한다 —
 *   · 표시하지 않음          → 목록 위에 항상 그린다
 *   · 글자가 너무 작음        → .note(12px) 가 아니라 .disclose(15px) 로 띄운다
 *   · 배경과 비슷한 색        → 노랑 + 4px 테두리 상자로 본문과 끊는다
 *   · 영문·줄임말로 기재      → 한국어 화면은 한국어로, 영어 화면은 영어로 (같은 쪽 지침)
 */
export const COUPANG_DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/// 우리가 태그를 찍어도 되는 주소. 남의 사이트 링크에 파트너스 태그를 붙이면 그냥 깨진 링크가 된다.
const HOSTS = new Set(["coupang.com", "www.coupang.com", "m.coupang.com", "link.coupang.com"]);

/**
 * 이미 있는 쿠팡 상품 주소에 태그를 붙인다.
 *
 * 파트너스 대시보드에서 뽑은 링크를 그대로 써도 되지만, 상품 주소를 복사해 붙여넣는
 * 쪽이 훨씬 잦다. 그때 태그가 빠지는 것을 막는다.
 *
 * 쿠팡이 아닌 주소는 null 을 돌려준다 - 조용히 태그만 빠진 링크를 만들어 내보내면
 * 언제 수수료가 새고 있는지 알 수 없게 된다.
 */
export function coupangLink(raw: string, subId?: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) return null;

  u.searchParams.set("lptag", COUPANG_TAG);
  if (subId) u.searchParams.set("subid", subId);
  return u.toString();
}

/**
 * 검색 결과로 보내는 링크.
 *
 * 상품 하나를 콕 집으면 품절되거나 판매자가 내리는 순간 죽은 링크가 된다. 모형
 * 재료처럼 "이 카테고리에서 아무거나" 인 물건은 검색으로 보내는 편이 오래 간다.
 * 값을 비교해 고르는 것도 사는 사람 몫으로 남는다.
 */
export function coupangSearch(keyword: string, subId?: string): string {
  const u = new URL("https://www.coupang.com/np/search");
  u.searchParams.set("q", keyword);
  u.searchParams.set("channel", "user");
  u.searchParams.set("lptag", COUPANG_TAG);
  if (subId) u.searchParams.set("subid", subId);
  return u.toString();
}
