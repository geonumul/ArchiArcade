"use client";

import { useEffect, useState } from "react";
import { dict, type Lang } from "@/lib/i18n";

interface CommCat {
  icon: string;
  t: string;
  d: string;
}

/**
 * 오락실 허브.
 *
 * 원본 index.html 의 vArcade 화면을 옮긴 것이다. 문구는 전부 추출해 둔 i18n 사전에서
 * 읽으므로 9개 언어가 그대로 따라온다 — 화면에 한국어를 직접 적지 않는다.
 */
export function Hub({
  lang,
  onPlay,
  onOpenBoards,
}: {
  lang: Lang;
  onPlay: () => void;
  onOpenBoards: () => void;
}) {
  const d = dict(lang) as unknown as Record<string, unknown>;
  const cartNames = (d.cartNames as string[]) ?? [];
  const commOrder = (d.commOrder as string[]) ?? [];
  const commCat = (d.commCat as Record<string, CommCat>) ?? {};

  const [interested, setInterested] = useState<Record<string, number>>({});
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/interest")
      .then((r) => r.json())
      .then((j: { counts?: Record<string, number> }) => setInterested(j.counts ?? {}))
      .catch(() => undefined);
  }, []);

  const like = async (feature: string) => {
    if (done.has(feature)) return;
    setDone((s) => new Set(s).add(feature));
    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature, lang }),
      });
      if (res.ok) {
        const j = (await res.json()) as { count: number };
        setInterested((c) => ({ ...c, [feature]: j.count }));
      }
    } catch {
      /* 관심 등록 실패는 조용히 넘긴다 — 게임 진행과 무관하다 */
    }
  };

  const strip = (s: string) => s.replace(/<br\s*\/?>/gi, " ");

  return (
    <>
      <section className="aa-panel">
        <h1 className="aa-title">{strip(String(d.hubLogo ?? "ARCHI ARCADE"))}</h1>
        <div className="aa-marquee">
          <span>{String(d.marquee ?? "")}</span>
        </div>
      </section>

      {/* 카트리지 — 1번만 열려 있고 나머지는 준비 중. 원본과 동일하다. */}
      <section className="aa-panel">
        <div className="aa-carts">
          {cartNames.map((name, i) => (
            <button
              key={i}
              className={i === 0 ? "aa-cart aa-cart-open" : "aa-cart"}
              onClick={i === 0 ? onPlay : undefined}
              disabled={i !== 0}
            >
              <span className="aa-cart-name">{strip(name)}</span>
              <span className="aa-cart-tag">{i === 0 ? "PLAY ▶" : "COMING SOON"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="aa-panel">
        <h2 className="aa-sub">{String(d.sugName ?? "")}</h2>
        <p className="aa-note">{String(d.sugSmall ?? "")}</p>
        <button className="aa-btn" onClick={onOpenBoards}>
          {String(d.sugTag ?? "▶")}
        </button>
      </section>

      {/* 커뮤니티 윙 — 아직 오픈 전이라 관심도만 모은다.
          어느 나라에서 어떤 기능을 원하는지가 곧 시장 조사 데이터가 된다. */}
      <section className="aa-panel">
        <h2 className="aa-sub">{String(d.commHead ?? "")}</h2>
        <p className="aa-note">{String(d.commSoonTag ?? "")}</p>
        {commOrder.map((key) => {
          const c = commCat[key];
          if (!c) return null;
          return (
            <div key={key} className="aa-res" style={{ display: "block" }}>
              <div style={{ fontSize: 15 }}>
                {c.icon} {c.t}
              </div>
              <div className="aa-note" style={{ textAlign: "left", marginTop: 6 }}>
                {c.d}
              </div>
              <button
                className="aa-btn"
                style={{ marginTop: 10 }}
                disabled={done.has(key)}
                onClick={() => like(key)}
              >
                {done.has(key)
                  ? String(d.interestDone ?? "✔")
                  : `${String(d.btnInterest ?? "♥")}  ${interested[key] ?? 0}`}
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
