import SCHOOLS from "@/data/schools.json";

export interface School {
  domain: string;
  /// 영문 이름. 화면에서 크게 쓰는 쪽이다.
  name: string;
  /**
   * 현지어 이름. 영문 옆에 작게 붙인다.
   *
   * 영문만으로는 한국 학생이 자기 학교를 한눈에 못 찾고, 현지어만 쓰면 나라마다
   * 다른 글자가 섞여 목록이 흐트러진다. 그래서 둘 다 두고 크기로 구분한다.
   * 출처가 없으면 비어 있고, 그때는 영문만 보인다 - 지어내지 않는다.
   */
  local?: string;
  country: string;
}

interface SuffixRule {
  suffix: string;
  country: string;
}

interface SchoolEntry {
  name: string;
  local?: string;
  country: string;
}

const SUFFIX_RULES: SuffixRule[] = SCHOOLS.suffixRules;
const KNOWN: Record<string, SchoolEntry> = SCHOOLS.domains;

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
  if (known) return { domain, name: known.name, local: known.local, country: known.country };

  // 서브도메인까지 허용한다 (arch.snu.ac.kr → snu.ac.kr)
  for (const [d, meta] of Object.entries(KNOWN)) {
    if (domain.endsWith("." + d)) {
      return { domain: d, name: meta.name, local: meta.local, country: meta.country };
    }
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

// 학과 목록은 lib/majors.ts 에 있다. 화면에서 학과만 쓰려고 이 파일을 import 하면
// 1,800여 개 학교 도메인이 브라우저 번들로 딸려 들어가기 때문에 일부러 나눠 두었다.
export { MAJORS, isMajor, majorLabel, type MajorCode } from "@/lib/majors";
