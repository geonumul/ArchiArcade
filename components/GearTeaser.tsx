"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";

/**
 * 아직 안 연 밤샘 장비 화면.
 *
 * 관리자가 아닌 사람에게는 목록 대신 이것이 나온다. 만들어 두고 닫아 둔 이유는
 * 서비스가 아직 그 정도로 여물지 않아서고, 그렇다고 페이지를 통째로 없애면
 * "이걸 원하는 사람이 있긴 한가" 를 영영 알 수 없다.
 *
 * 그래서 여는 대신 세어 둔다. 여기서 모이는 숫자가 나중에 이 기능을 열지 말지를
 * 정하는 근거가 된다 - 허브의 커뮤니티 카드 네 개와 같은 표(FeatureInterest)에
 * 쌓이므로, 무엇을 먼저 만들지 나란히 놓고 비교할 수 있다.
 *
 * 상품 링크는 이 화면에 없다. 감춘 것이 아니라 서버가 아예 안 내려보낸다
 * (app/gear/page.tsx). 대가성 문구가 필요 없는 이유도 그것이다 - 여기에는
 * 수수료가 걸린 링크가 한 줄도 없다.
 */

type L = "ko" | "en";

const UI: Record<L, {
  title: string;
  body: string;
  want: string;
  sending: string;
  thanks: string;
  count: (n: number) => string;
  err: string;
  back: string;
}> = {
  ko: {
    title: "밤샘 장비",
    body:
      "설계실에서 꼭 떨어지는 것들 — 폼보드, 아트나이프 날, 트레이싱지 — 을 " +
      "어디서 구하는지 모아 두는 칸입니다. 온라인과, 지금 당장 필요할 때 갈 " +
      "오프라인까지. 아직 열지 않았습니다.",
    want: "이 기능 원해요",
    sending: "보내는 중...",
    thanks: "고맙습니다. 원하는 사람이 모이면 엽니다.",
    count: (n) => `지금까지 ${n.toLocaleString()}명이 눌렀어요.`,
    err: "잠시 후 다시 눌러주세요.",
    back: "← 오락실로",
  },
  en: {
    title: "All-nighter gear",
    body:
      "A shelf of what always runs out in studio — foam board, blades, tracing " +
      "paper — and where to get it, online and from a shop you can reach tonight. " +
      "Not open yet.",
    want: "I want this",
    sending: "Sending...",
    thanks: "Thank you. It opens once enough people ask.",
    count: (n) => `${n.toLocaleString()} people have asked so far.`,
    err: "Please try again in a moment.",
    back: "← Back to the arcade",
  },
};

/// 한 사람이 여러 번 눌러 숫자를 부풀리지 않게. 진짜 방어는 서버 레이트리밋이고,
/// 이것은 이미 누른 사람에게 버튼을 다시 보여 주지 않기 위한 것이다.
const MARK = "arcade-gear-want";

export function GearTeaser({ lang }: { lang: L }) {
  const t = UI[lang];

  const [done, setDone] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (localStorage.getItem(MARK)) {
      setDone(true);
      // 이미 누른 사람에게도 그동안 얼마나 모였는지는 보여 준다.
      fetch("/api/interest", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { counts?: Record<string, number> }) => setCount(d.counts?.gear ?? 0))
        .catch(() => undefined);
    }
  }, []);

  const want = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "gear", lang }),
      });
      const d = (await res.json()) as { count?: number };
      if (!res.ok) {
        setErr(t.err);
        return;
      }
      localStorage.setItem(MARK, "1");
      setCount(d.count ?? null);
      setDone(true);
    } catch {
      setErr(t.err);
    } finally {
      setBusy(false);
    }
  }, [lang, t]);

  return (
    <Cabinet title={t.title} hudRight="SOON">
      <div className="note">{t.body}</div>

      {done ? (
        <>
          <div className="note" style={{ color: "var(--yellow)" }}>{t.thanks}</div>
          {count !== null && <div className="note">{t.count(count)}</div>}
        </>
      ) : (
        <>
          <div className="err">{err}</div>
          <button className="btn kr" disabled={busy} onClick={want}>
            {busy ? t.sending : t.want}
          </button>
        </>
      )}

      <Link className="btn kr gray" href={`/?lang=${lang}`}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
