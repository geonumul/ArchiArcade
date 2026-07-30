import type { Lang } from "@/lib/i18n";
import TIERS from "@/data/titles.json";

export interface TitleTier {
  /// 이 칭호를 얻는 최소 판수
  plays: number;
  name: Record<string, string>;
}

export const TITLE_TIERS: TitleTier[] = TIERS;

/// 현재 판수에 해당하는 칭호. 원본 titleFor() 와 동일하게 조건을 만족하는 마지막 티어를 쓴다.
export function titleFor(plays: number, lang: Lang): string {
  let tier = TITLE_TIERS[0];
  for (const t of TITLE_TIERS) {
    if (plays >= t.plays) tier = t;
  }
  return tier.name[lang] ?? tier.name.ko;
}

/// 다음 칭호 티어. 최고 티어에 도달했으면 null.
export function nextTitle(plays: number): TitleTier | null {
  for (const t of TITLE_TIERS) {
    if (plays < t.plays) return t;
  }
  return null;
}
