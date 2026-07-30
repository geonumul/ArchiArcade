"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LANGS, LANG_LABELS, type Lang, t } from "@/lib/i18n";
import { bank, BANK_SIZE } from "@/lib/game/bank";
import { drawRound, DEFAULT_ROUND_LENGTH } from "@/lib/game/round";
import { titleFor } from "@/lib/game/titles";

type Phase = "title" | "quiz" | "end";
type Choice = "a" | "b";

interface Tally {
  a: number;
  b: number;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("ko");
  const [phase, setPhase] = useState<Phase>("title");
  const [seed, setSeed] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Choice[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [pending, setPending] = useState(false);

  const questions = useMemo(() => bank(lang), [lang]);
  const current = seed.length ? questions[seed[step]] : undefined;

  // 언어를 바꿔도 출제 목록(idx)은 그대로 유지된다 — 9개 은행이 1:1 정렬이라 가능한 동작이다.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const start = useCallback(() => {
    setSeed(drawRound(DEFAULT_ROUND_LENGTH, BANK_SIZE));
    setStep(0);
    setPicks([]);
    setTally(null);
    setPhase("quiz");
  }, []);

  const pick = useCallback(
    async (choice: Choice) => {
      if (!current || pending || tally) return;
      setPending(true);
      setPicks((p) => [...p, choice]);
      try {
        const res = await fetch("/api/votes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idx: current.idx, choice, lang }),
        });
        setTally(res.ok ? ((await res.json()) as Tally) : { a: 0, b: 0 });
      } catch {
        setTally({ a: 0, b: 0 });
      } finally {
        setPending(false);
      }
    },
    [current, lang, pending, tally]
  );

  const next = useCallback(() => {
    setTally(null);
    if (step + 1 >= seed.length) setPhase("end");
    else setStep((s) => s + 1);
  }, [seed.length, step]);

  const total = tally ? tally.a + tally.b : 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <main className="aa-shell">
      <header className="aa-bar">
        <span className="aa-brand">ARCHI ARCADE</span>
        <select
          className="aa-lang"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label="language"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_LABELS[l]}
            </option>
          ))}
        </select>
      </header>

      {phase === "title" && (
        <section className="aa-panel">
          <h1 className="aa-title">{t(lang, "hubLogo").replace(/<br\s*\/?>/g, " ")}</h1>
          <p className="aa-note">
            {BANK_SIZE} × {LANGS.length} — {LANGS.length * BANK_SIZE}
          </p>
          <button className="aa-btn aa-btn-primary" onClick={start}>
            SOLO ▶
          </button>
        </section>
      )}

      {phase === "quiz" && current && (
        <section className="aa-panel">
          <div className="aa-count">
            {String(step + 1).padStart(2, "0")} / {String(seed.length).padStart(2, "0")}
          </div>
          <h2 className="aa-q">{current.q}</h2>

          {!tally ? (
            <div className="aa-opts">
              <button className="aa-btn" disabled={pending} onClick={() => pick("a")}>
                {current.a}
              </button>
              <button className="aa-btn" disabled={pending} onClick={() => pick("b")}>
                {current.b}
              </button>
            </div>
          ) : (
            <div className="aa-opts">
              <div className="aa-res">
                <span>{current.a}</span>
                <b>{pct(tally.a)}%</b>
                <i style={{ width: `${pct(tally.a)}%` }} />
              </div>
              <div className="aa-res">
                <span>{current.b}</span>
                <b>{pct(tally.b)}%</b>
                <i style={{ width: `${pct(tally.b)}%` }} />
              </div>
              <p className="aa-note">{total} votes</p>
              <button className="aa-btn aa-btn-primary" onClick={next}>
                ▶
              </button>
            </div>
          )}
        </section>
      )}

      {phase === "end" && (
        <section className="aa-panel">
          <h2 className="aa-title">CLEAR!</h2>
          <p className="aa-note">{titleFor(picks.length, lang)}</p>
          <button className="aa-btn aa-btn-primary" onClick={start}>
            ↻
          </button>
        </section>
      )}
    </main>
  );
}
