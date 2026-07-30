import SCHOOLS from "@/data/schools.json";

export interface School {
  domain: string;
  name: string;
  country: string;
}

interface SuffixRule {
  suffix: string;
  country: string;
}

const SUFFIX_RULES: SuffixRule[] = SCHOOLS.suffixRules;
const KNOWN: Record<string, { name: string; country: string }> = SCHOOLS.domains;

/// 무료·임시 메일은 학교 인증에 쓸 수 없다. 목록이 완전할 수는 없지만,
/// 학술 도메인만 통과시키는 규칙 자체가 1차 방어선이라 여기는 보조 수단이다.
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "temp-mail.org",
  "throwawaymail.com",
]);

export function domainOf(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  return m ? m[1] : null;
}

/**
 * 이메일이 학교 메일인지 판별한다.
 *
 * 두 경로를 쓴다. 한국·일본·중국·대만·미국처럼 학술 전용 TLD 가 있는 나라는
 * 접미사만 봐도 확실하다. 유럽은 대학이 일반 국가 TLD 를 쓰기 때문에 그럴 수 없어
 * 개별 도메인 목록에 의존한다 — 목록에 없는 학교는 통과하지 못하므로, 신청을 받아
 * 계속 채워 넣어야 하는 종류의 데이터다.
 */
export function resolveSchool(email: string): School | null {
  const domain = domainOf(email);
  if (!domain || DISPOSABLE.has(domain)) return null;

  const known = KNOWN[domain];
  if (known) return { domain, name: known.name, country: known.country };

  // 서브도메인까지 허용한다 (arch.snu.ac.kr → snu.ac.kr)
  for (const [d, meta] of Object.entries(KNOWN)) {
    if (domain.endsWith("." + d)) return { domain: d, name: meta.name, country: meta.country };
  }

  for (const rule of SUFFIX_RULES) {
    if (domain.endsWith(rule.suffix)) {
      // 목록에 이름이 없으면 도메인을 그대로 학교 식별자로 쓴다.
      // 이름은 나중에 채워 넣더라도 집계는 지금부터 정확히 쌓인다.
      return { domain, name: domain, country: rule.country };
    }
  }

  return null;
}

export function isSchoolEmail(email: string): boolean {
  return resolveSchool(email) !== null;
}

/**
 * 학과 구분.
 *
 * 건축학과만 두면 실내건축·도시·조경·공간디자인 학생이 낄 자리가 없다. 설계실 문화를
 * 공유하는 전공을 한 커뮤니티에 묶되, 학과별로 갈라볼 수 있게 코드를 따로 둔다.
 * 코드는 저장용으로 고정하고 표시 이름만 언어별로 바꾼다.
 */
export const MAJORS = [
  { code: "arch", ko: "건축학", en: "Architecture" },
  { code: "archeng", ko: "건축공학", en: "Architectural Engineering" },
  { code: "interior", ko: "실내건축", en: "Interior Architecture" },
  { code: "urban", ko: "도시공학", en: "Urban Engineering" },
  { code: "landscape", ko: "조경", en: "Landscape Architecture" },
  { code: "spatial", ko: "공간디자인", en: "Spatial Design" },
  { code: "etc", ko: "기타", en: "Other" },
] as const;

export type MajorCode = (typeof MAJORS)[number]["code"];

export function isMajor(v: unknown): v is MajorCode {
  return typeof v === "string" && MAJORS.some((m) => m.code === v);
}

export function majorLabel(code: string, lang: string): string {
  const m = MAJORS.find((x) => x.code === code);
  if (!m) return code;
  return lang === "ko" ? m.ko : m.en;
}
