/**
 * 밤샘 장비 목록.
 *
 * 상품이 아니라 "있어야 하는 물건" 을 적는다. 어떤 아트나이프가 좋은지는 손에 따라
 * 다르고, 써 보지도 않은 물건에 등수를 매기면 목록 전체를 못 믿게 된다. 무엇이
 * 필요한지까지가 우리가 아는 것이고, 어느 것을 살지는 사는 사람이 정한다.
 *
 * 검색어를 저장하는 이유: 상품 번호를 박아 두면 품절되거나 판매자가 내리는 순간
 * 죽은 링크가 된다. 검색어는 안 죽고, 값 비교도 사는 사람 몫으로 남는다.
 *
 * 오프라인을 같이 두는 이유: 모형 재료는 대개 오늘 밤에 있어야 하는 물건이다.
 * 이틀 걸리는 배송이 답이 아닐 때가 더 많다.
 */

export interface GearText {
  name: string;
  /// 쇼핑몰에 그대로 넣을 검색어. 이름과 다를 수 있다(이름은 짧게, 검색어는 잘 걸리게).
  keyword: string;
  note: string;
}

export interface GearItem {
  /// subid 로도 쓴다 — 정산 화면에서 무엇이 팔렸는지 이걸로 구분한다.
  id: string;
  ko: GearText;
  en: GearText;
}

export interface GearGroup {
  id: string;
  ko: { title: string; offline: string[] };
  en: { title: string; offline: string[] };
  items: GearItem[];
}

export const GEAR: GearGroup[] = [
  {
    id: "model",
    ko: { title: "모형 재료", offline: ["화방", "모형재료"] },
    en: { title: "Model materials", offline: ["art supply store", "model shop"] },
    items: [
      {
        id: "foamboard",
        ko: { name: "폼보드 · 우드락", keyword: "폼보드 5mm", note: "두께별로 쓰임이 다르다. 3·5·10mm 를 섞어 두면 대개 해결된다." },
        en: { name: "Foam board", keyword: "foam board 5mm", note: "Thickness decides what it can do. Keeping 3, 5 and 10mm around covers most of it." },
      },
      {
        id: "balsa",
        ko: { name: "발사 · 바스우드 봉", keyword: "발사나무 각봉", note: "기둥과 보. 얇은 것부터 떨어진다." },
        en: { name: "Balsa / basswood strips", keyword: "balsa wood strips", note: "Columns and beams. The thin ones run out first." },
      },
      {
        id: "acrylic",
        ko: { name: "아크릴 · 투명판", keyword: "아크릴판 2mm", note: "유리 대신. 지문이 잘 남아 보호필름은 마지막에 벗긴다." },
        en: { name: "Acrylic sheet", keyword: "clear acrylic sheet 2mm", note: "Stands in for glass. Peel the film last — it holds fingerprints." },
      },
      {
        id: "glue",
        ko: { name: "스프레이 접착제 · 목공풀", keyword: "스프레이 접착제 77", note: "넓은 면은 스프레이, 붙잡아야 하는 곳은 목공풀." },
        en: { name: "Spray adhesive / wood glue", keyword: "spray adhesive 77", note: "Spray for large faces, wood glue where it has to hold." },
      },
    ],
  },
  {
    id: "cut",
    ko: { title: "자르고 붙이는 것", offline: ["화방", "철물점"] },
    en: { title: "Cutting and holding", offline: ["art supply store", "hardware store"] },
    items: [
      {
        id: "knife",
        ko: { name: "아트나이프 · 여분 날", keyword: "아트나이프 30도 날", note: "무딘 날이 손을 다치게 한다. 날은 아끼는 물건이 아니다." },
        en: { name: "Art knife + spare blades", keyword: "art knife 30 degree blades", note: "A dull blade is what cuts you. Blades are not the thing to save on." },
      },
      {
        id: "ruler",
        ko: { name: "철제 자", keyword: "철제 직선자 60cm", note: "플라스틱 자를 대고 자르면 자가 먼저 깎인다." },
        en: { name: "Steel ruler", keyword: "steel ruler 60cm", note: "Cut against plastic and you shave the ruler, not the board." },
      },
      {
        id: "mat",
        ko: { name: "커팅매트", keyword: "커팅매트 A2", note: "책상보다 조금 작게. 큰 판을 돌려가며 자를 수 있어야 한다." },
        en: { name: "Cutting mat", keyword: "cutting mat A2", note: "Slightly smaller than the desk, so you can turn a big sheet on it." },
      },
      {
        id: "gluegun",
        ko: { name: "글루건", keyword: "글루건 스틱", note: "빠르지만 자국이 남는다. 보이는 면에는 쓰지 않는다." },
        en: { name: "Glue gun", keyword: "glue gun sticks", note: "Fast, but it leaves a mark. Not for faces that show." },
      },
    ],
  },
  {
    id: "draw",
    ko: { title: "도면 · 제도", offline: ["화방", "문구점"] },
    en: { title: "Drawing", offline: ["art supply store", "stationery store"] },
    items: [
      {
        id: "trace",
        ko: { name: "트레이싱지", keyword: "트레이싱지 롤", note: "낱장보다 롤이 싸다. 크리틱 전날에 제일 빨리 없어진다." },
        en: { name: "Tracing paper", keyword: "tracing paper roll", note: "Rolls beat sheets on price. It disappears fastest the night before a crit." },
      },
      {
        id: "pencil",
        ko: { name: "제도 샤프", keyword: "제도 샤프 0.5", note: "0.3 과 0.5 두 자루. 심은 따로 넉넉히." },
        en: { name: "Drafting pencil", keyword: "drafting pencil 0.5", note: "One 0.3 and one 0.5. Buy lead separately, and plenty." },
      },
      {
        id: "scale",
        ko: { name: "스케일자", keyword: "삼각스케일자", note: "1/100 과 1/200 만 있으면 대부분 넘어간다." },
        en: { name: "Scale ruler", keyword: "triangular scale ruler", note: "1:100 and 1:200 get you through most of it." },
      },
      {
        id: "tape",
        ko: { name: "마스킹테이프", keyword: "마스킹테이프 종이", note: "떼어낼 것을 붙일 때. 셀로판테이프는 트레이싱지를 찢는다." },
        en: { name: "Masking tape", keyword: "paper masking tape", note: "For anything you will peel off. Clear tape tears tracing paper." },
      },
    ],
  },
  {
    id: "night",
    ko: { title: "밤을 버티는 것", offline: ["다이소", "편의점"] },
    en: { title: "Getting through the night", offline: ["convenience store", "pharmacy"] },
    items: [
      {
        id: "mask",
        ko: { name: "방진 마스크 · 보안경", keyword: "방진마스크 방독", note: "스프레이 접착제를 좁은 방에서 쓴다면 이건 선택이 아니다." },
        en: { name: "Respirator + goggles", keyword: "respirator mask spray paint", note: "If you spray adhesive in a small room, this is not optional." },
      },
      {
        id: "lamp",
        ko: { name: "데스크 스탠드", keyword: "제도용 스탠드 클램프", note: "칼질하는 손에 그림자가 지지 않는 위치로." },
        en: { name: "Desk lamp", keyword: "clamp desk lamp", note: "Placed so your cutting hand casts no shadow." },
      },
      {
        id: "wrist",
        ko: { name: "손목 보호대", keyword: "손목 보호대", note: "3학년쯤 필요해진다. 그전에 사 두면 3학년이 편하다." },
        en: { name: "Wrist support", keyword: "wrist support brace", note: "You need it by third year. Buying it earlier makes third year easier." },
      },
      {
        id: "caffeine",
        ko: { name: "카페인", keyword: "고카페인 음료", note: "새벽 네 시 이후의 한 캔은 대개 다음 날을 빌려 쓰는 것이다." },
        en: { name: "Caffeine", keyword: "energy drink", note: "After 4am, a can is mostly borrowed from tomorrow." },
      },
    ],
  },
];
