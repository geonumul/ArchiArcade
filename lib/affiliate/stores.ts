import { COUPANG_TAG, coupangSearch } from "@/lib/affiliate/coupang";

/**
 * 물건 하나를 살 수 있는 곳들.
 *
 * 상품을 콕 집어 "이거 사세요" 라고 하지 않는다. 어떤 폼보드가 좋은지는 쓰는 사람마다
 * 다르고, 우리가 써 보지도 않은 물건을 추천하면 그 순간 이 목록 전체를 못 믿게 된다.
 * 그래서 필요한 물건만 적고, 고르는 일은 사는 사람에게 남긴다.
 *
 * 구매처를 여러 곳 붙이는 이유도 같다. 한 곳만 걸면 그건 추천이 아니라 광고다.
 * 값을 비교하고 배송을 견줘 고를 수 있어야 목록이 쓸모 있어진다.
 *
 * 제휴가 걸린 곳(쿠팡)과 그냥 링크인 곳(네이버·오프라인)이 섞여 있다. 어느 쪽인지
 * 화면에 표시한다 - 어떤 링크가 우리에게 돈이 되는지 숨기지 않는 편이, 나중에
 * 들켜서 목록째 불신받는 것보다 싸다.
 */

export type StoreId = "coupang" | "naver" | "amazon" | "ali";

export interface Store {
  id: StoreId;
  label: string;
  /// 제휴 링크인가. 화면에 표시하고 대가성 문구를 띄우는 근거가 된다.
  paid: boolean;
  search(keyword: string, subId: string): string;
}

/**
 * 아마존 어소시에이트 태그.
 *
 * 아직 계정이 없어 비어 있다. 비어 있으면 태그 없는 맨 링크로 나간다 - 링크 자체는
 * 멀쩡히 동작하고 수수료만 안 잡힌다. 계정이 생기면 이 값만 채우면 되고, 그 순간
 * 아래 en 목록의 모든 링크가 한꺼번에 제휴 링크가 된다.
 *
 * 마켓플레이스마다 계정과 태그가 따로다(amazon.com 과 amazon.co.jp 는 남남이다).
 * 지금은 .com 하나만 두고, 일본·독일·프랑스 계정을 만들 때 도메인별 표로 넓힌다.
 */
const AMAZON_TAG = "";

function amazonSearch(keyword: string, subId: string): string {
  const u = new URL("https://www.amazon.com/s");
  u.searchParams.set("k", keyword);
  if (AMAZON_TAG) {
    u.searchParams.set("tag", AMAZON_TAG);
    // 아마존은 subid 대신 ascsubtag 를 쓴다.
    u.searchParams.set("ascsubtag", subId);
  }
  return u.toString();
}

function naverSearch(keyword: string): string {
  const u = new URL("https://search.shopping.naver.com/search/all");
  u.searchParams.set("query", keyword);
  return u.toString();
}

function aliSearch(keyword: string): string {
  const u = new URL("https://www.aliexpress.com/wholesale");
  u.searchParams.set("SearchText", keyword);
  return u.toString();
}

export const STORES: Record<StoreId, Store> = {
  coupang: {
    id: "coupang",
    label: "쿠팡",
    paid: Boolean(COUPANG_TAG),
    search: (k, s) => coupangSearch(k, s),
  },
  naver: {
    id: "naver",
    label: "네이버쇼핑",
    paid: false,
    search: (k) => naverSearch(k),
  },
  amazon: {
    id: "amazon",
    label: "Amazon",
    paid: Boolean(AMAZON_TAG),
    search: (k, s) => amazonSearch(k, s),
  },
  ali: {
    id: "ali",
    label: "AliExpress",
    paid: false,
    search: (k) => aliSearch(k),
  },
};

/// 언어권별로 갈 수 있는 곳. 쿠팡·네이버는 국내 배송뿐이라 한국어 화면에만 둔다.
export const STORES_BY_LANG: Record<"ko" | "en", StoreId[]> = {
  ko: ["coupang", "naver"],
  en: ["amazon", "ali"],
};

/**
 * 오프라인은 파는 곳을 지도에서 찾게 한다.
 *
 * 모형 재료는 오늘 밤에 있어야 하는 물건이라 이틀 걸리는 배송이 답이 아닐 때가 많다.
 * 그리고 폼보드처럼 크고 잘 휘는 것은 직접 골라 오는 편이 낫다. 여기서 나가는 링크는
 * 우리에게 아무 수익이 없다 - 그래도 놓는 이유는, 없으면 이 목록이 쇼핑 링크 모음일
 * 뿐이고 있으면 실제로 쓸모 있는 목록이 되기 때문이다.
 */
export function mapSearch(query: string, lang: "ko" | "en"): string {
  return lang === "ko"
    ? `https://map.naver.com/p/search/${encodeURIComponent(query)}`
    : `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}
