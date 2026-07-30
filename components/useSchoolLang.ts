"use client";

import { useEffect, useState } from "react";
import { SCHOOL_UI, isSchoolLang, type SchoolLang, type SchoolStrings } from "@/lib/i18n/school";

/**
 * 허브에서 넘어올 때 붙는 `?lang=` 을 읽는다.
 *
 * useSearchParams 를 쓰면 프리렌더에 Suspense 경계를 요구하므로 location 을 직접 읽는다.
 * 첫 프레임은 기본값(ko)으로 그려지고 곧바로 실제 언어로 바뀐다 — 데이터도 마운트 후에
 * 가져오므로 체감상 같은 시점이다.
 */
export function useSchoolLang(): { lang: SchoolLang; t: SchoolStrings } {
  const [lang, setLang] = useState<SchoolLang>("ko");

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("lang");
    if (isSchoolLang(v)) setLang(v);
  }, []);

  return { lang, t: SCHOOL_UI[lang] };
}

/// 오락실로 돌아갈 때 언어를 잃지 않도록 링크에 붙여 준다.
export function withLang(href: string, lang: SchoolLang): string {
  return href.includes("?") ? `${href}&lang=${lang}` : `${href}?lang=${lang}`;
}
