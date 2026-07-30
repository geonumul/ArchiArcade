/**
 * 학과 구분.
 *
 * 건축학과만 두면 실내건축·도시·조경·공간디자인 학생이 낄 자리가 없다. 설계실 문화를
 * 공유하는 전공을 한 커뮤니티에 묶되, 학과별로 갈라볼 수 있게 코드를 따로 둔다.
 * 코드는 저장용으로 고정하고 표시 이름만 언어별로 바꾼다.
 *
 * lib/school.ts 와 분리해 둔 이유가 있다. school.ts 는 1,800여 개 학교 도메인 목록을
 * 불러오는데, 화면에서 학과 이름만 쓰려고 그 파일을 import 하면 목록 전체가 브라우저
 * 번들로 딸려 들어간다(실제로 137KB 가 실려 나갔다). 학과는 화면에서 쓰고 도메인 판별은
 * 서버에서만 쓰므로 모듈을 나눈다.
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
