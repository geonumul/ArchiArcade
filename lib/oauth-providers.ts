/**
 * 국가별 소셜 로그인 제공자.
 *
 * 학교 메일 인증(lib/school.ts)과는 목적이 다르다.
 *   - 학교 인증 : "지금 이 학교 학생이다"를 증명한다. 졸업하면 쓸 수 없다.
 *   - 소셜 로그인 : "같은 사람이다"를 이어준다. 졸업생·일반인도 쓸 수 있다.
 * 둘은 독립적이며, 한 사람이 둘 다 가질 수도 하나만 가질 수도 있다.
 *
 * 환경변수(클라이언트 ID/시크릿)가 없는 제공자는 목록에서 자동으로 빠진다.
 * 하나도 없으면 기존 닉네임+비밀번호 로그인만 노출된다.
 */
export interface OAuthProvider {
  id: string;
  label: string;
  /// 이 제공자를 우선 노출할 국가. "*" 는 전세계 공통.
  regions: string[];
  envClientId: string;
  envClientSecret: string;
}

export const PROVIDERS: OAuthProvider[] = [
  {
    id: "google",
    label: "Google",
    regions: ["*"],
    envClientId: "GOOGLE_CLIENT_ID",
    envClientSecret: "GOOGLE_CLIENT_SECRET",
  },
  {
    id: "kakao",
    label: "카카오",
    regions: ["KR"],
    envClientId: "KAKAO_CLIENT_ID",
    envClientSecret: "KAKAO_CLIENT_SECRET",
  },
  {
    id: "naver",
    label: "네이버",
    regions: ["KR"],
    envClientId: "NAVER_CLIENT_ID",
    envClientSecret: "NAVER_CLIENT_SECRET",
  },
  {
    id: "line",
    label: "LINE",
    regions: ["JP", "TW"],
    envClientId: "LINE_CLIENT_ID",
    envClientSecret: "LINE_CLIENT_SECRET",
  },
  {
    id: "apple",
    label: "Apple",
    regions: ["*"],
    envClientId: "APPLE_CLIENT_ID",
    envClientSecret: "APPLE_CLIENT_SECRET",
  },
];

/// 언어 코드로부터 추정한 국가. 정확한 위치가 아니라 "어느 버튼을 위에 둘까" 정도의 힌트다.
const LANG_TO_REGION: Record<string, string> = {
  ko: "KR",
  ja: "JP",
  zh: "CN",
  tw: "TW",
  en: "US",
  fr: "FR",
  it: "IT",
  de: "DE",
  es: "ES",
};

export function configured(p: OAuthProvider): boolean {
  return Boolean(process.env[p.envClientId] && process.env[p.envClientSecret]);
}

/**
 * 해당 언어권에서 보여줄 로그인 버튼 목록.
 * 그 나라에서 많이 쓰는 제공자를 앞에 두고, 전세계 공통 제공자를 뒤에 붙인다.
 */
export function providersFor(lang: string): { id: string; label: string }[] {
  const region = LANG_TO_REGION[lang] ?? "US";
  const enabled = PROVIDERS.filter(configured);

  const local = enabled.filter((p) => p.regions.includes(region));
  const global = enabled.filter((p) => p.regions.includes("*") && !local.includes(p));

  return [...local, ...global].map((p) => ({ id: p.id, label: p.label }));
}

/// 설정이 하나라도 켜져 있는지 — UI 에서 소셜 로그인 영역 자체를 감출지 판단한다.
export const ANY_OAUTH_CONFIGURED = PROVIDERS.some(configured);
