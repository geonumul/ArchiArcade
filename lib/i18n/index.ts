import ko from "./ko.json";
import en from "./en.json";
import zh from "./zh.json";
import tw from "./tw.json";
import ja from "./ja.json";
import fr from "./fr.json";
import it from "./it.json";
import de from "./de.json";
import es from "./es.json";

/// 표시 순서까지 포함한 지원 언어 목록. 문항 은행 파일명과 1:1 대응한다.
export const LANGS = ["ko", "en", "zh", "tw", "ja", "fr", "it", "de", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  zh: "简体中文",
  tw: "繁體中文",
  ja: "日本語",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
  es: "Español",
};

const DICTS = { ko, en, zh, tw, ja, fr, it, de, es } as const;

export type Dict = typeof ko;

export function isLang(v: string | null | undefined): v is Lang {
  return !!v && (LANGS as readonly string[]).includes(v);
}

export function dict(lang: Lang): Dict {
  return DICTS[lang] as Dict;
}

/// 키가 빠진 언어가 있어도 화면이 비지 않도록 한국어로 폴백한다.
export function t(lang: Lang, key: keyof Dict): string {
  const d = DICTS[lang] as Record<string, unknown>;
  const v = d?.[key as string];
  if (typeof v === "string") return v;
  const fallback = (DICTS.ko as Record<string, unknown>)[key as string];
  return typeof fallback === "string" ? fallback : String(key);
}
