import type { Lang } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n";

import ko from "@/data/questions/ko.json";
import en from "@/data/questions/en.json";
import zh from "@/data/questions/zh.json";
import tw from "@/data/questions/tw.json";
import ja from "@/data/questions/ja.json";
import fr from "@/data/questions/fr.json";
import it from "@/data/questions/it.json";
import de from "@/data/questions/de.json";
import es from "@/data/questions/es.json";

export interface Question {
  /// 9개 언어가 공유하는 전역 문항 번호. 투표 합산의 유일한 키다.
  idx: number;
  q: string;
  a: string;
  b: string;
}

const BANKS: Record<Lang, Question[]> = { ko, en, zh, tw, ja, fr, it, de, es };

/// 모든 언어가 동일해야 하는 문항 수. 이 값이 언어마다 다르면 전역 통계가 깨진다.
export const BANK_SIZE = ko.length;

export function bank(lang: Lang): Question[] {
  return BANKS[lang] ?? BANKS.ko;
}

export function question(lang: Lang, idx: number): Question | undefined {
  return bank(lang)[idx];
}

/// 국가별 현지화 문항(거장·답사지·야식 등). 글로벌 비교 리포트에서 분리 집계한다.
/// docs/PHASE2.md 에 명시된 인덱스를 그대로 따른다.
export const LOCAL_VARIANT_IDX = new Set([69, 70, 84, 96, 114, 115]);

export function isLocalVariant(idx: number): boolean {
  return LOCAL_VARIANT_IDX.has(idx);
}

/// 9개 은행의 1:1 정렬 검증. 빌드/CI 와 테스트에서 함께 쓴다.
export function verifyBanks(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const lang of LANGS) {
    const b = BANKS[lang];
    if (!b) {
      problems.push(`${lang}: 은행 없음`);
      continue;
    }
    if (b.length !== BANK_SIZE) {
      problems.push(`${lang}: ${b.length}개 (기준 ${BANK_SIZE})`);
    }
    b.forEach((row, i) => {
      if (row.idx !== i) problems.push(`${lang}[${i}]: idx=${row.idx} 불일치`);
      if (!row.q || !row.a || !row.b) problems.push(`${lang}[${i}]: 빈 필드`);
    });
  }
  return { ok: problems.length === 0, problems };
}
