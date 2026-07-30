"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LANGS, LANG_LABELS, type Lang, t } from "@/lib/i18n";
import { bank, BANK_SIZE } from "@/lib/game/bank";
import { drawRound, DEFAULT_ROUND_LENGTH, ROUND_LENGTHS } from "@/lib/game/round";
import { DEFAULT_ROOM_SIZE, ROOM_SIZES } from "@/lib/capacity";
import { titleFor } from "@/lib/game/titles";
import { useRoomPoll, useCountdown, patchRoom, closeRoom, type RoomState } from "@/lib/useRoom";

type View = "hub" | "solo" | "host" | "join" | "room" | "end";
type Choice = "a" | "b";
type Mode = "solo" | "host" | "player";

interface Tally {
  a: number;
  b: number;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("ko");
  const [view, setView] = useState<View>("hub");
  const [mode, setMode] = useState<Mode>("solo");

  // 솔로 진행 상태
  const [seed, setSeed] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [plays, setPlays] = useState(0);

  // 방 상태
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [tally, setTally] = useState<Tally | null>(null);

  const questions = useMemo(() => bank(lang), [lang]);
  const { state: roomState, playerCount, maxPlayers, gone } = useRoomPoll(code, view === "room");

  // 호스트는 자기 상태를 밀어 올리고, 참가자는 폴링 결과를 따른다.
  const liveSeed = mode === "player" ? (roomState?.seed ?? []) : seed;
  const liveStep = mode === "player" ? (roomState?.step ?? 0) : step;
  const currentIdx = liveSeed[liveStep];
  const current = currentIdx === undefined ? undefined : questions[currentIdx];

  const countdown = useCountdown(mode === "solo" ? undefined : roomState?.deadline);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (gone) {
      setErr(t(lang, "err") ? "방이 종료됐어요" : "방이 종료됐어요");
      setView("hub");
      setCode(null);
    }
  }, [gone, lang]);

  const vote = useCallback(
    async (choice: Choice) => {
      if (currentIdx === undefined || tally) return;
      setBusy(true);
      try {
        const res = await fetch("/api/votes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idx: currentIdx, choice, lang, roomCode: code }),
        });
        setTally(res.ok ? ((await res.json()) as Tally) : { a: 0, b: 0 });
      } catch {
        setTally({ a: 0, b: 0 });
      } finally {
        setBusy(false);
      }
    },
    [code, currentIdx, lang, tally]
  );

  const startSolo = useCallback(() => {
    setMode("solo");
    setSeed(drawRound(DEFAULT_ROUND_LENGTH, BANK_SIZE));
    setStep(0);
    setTally(null);
    setErr("");
    setView("solo");
  }, []);

  const advance = useCallback(async () => {
    setTally(null);
    const nextStep = liveStep + 1;
    if (nextStep >= liveSeed.length) {
      setPlays((p) => p + 1);
      if (mode === "host" && code) {
        await patchRoom(code, { ...(roomState as RoomState), phase: "end", step: nextStep });
        await closeRoom(code);
        setCode(null);
      }
      setView("end");
      return;
    }
    if (mode === "host" && code && roomState) {
      await patchRoom(code, {
        ...roomState,
        step: nextStep,
        deadline: Date.now() + roomState.timeLimit * 1000,
      });
    }
    setStep(nextStep);
  }, [code, liveSeed.length, liveStep, mode, roomState]);

  const leave = useCallback(async () => {
    if (mode === "host" && code) await closeRoom(code);
    setCode(null);
    setTally(null);
    setView("hub");
  }, [code, mode]);

  // ── 화면 ──────────────────────────────────────────────────

  const langBar = (
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
  );

  const playing = view === "solo" || view === "room";

  return (
    <main className="aa-shell">
      {langBar}

      {err && <p className="aa-err">{err}</p>}

      {view === "hub" && (
        <section className="aa-panel">
          <h1 className="aa-title">{t(lang, "hubLogo").replace(/<br\s*\/?>/g, " ")}</h1>
          <p className="aa-note">
            {LANGS.length} langs · {BANK_SIZE} questions
          </p>
          <button className="aa-btn aa-btn-primary" onClick={startSolo}>
            SOLO ▶
          </button>
          <button className="aa-btn" onClick={() => { setErr(""); setView("host"); }}>
            HOST ▶
          </button>
          <button className="aa-btn" onClick={() => { setErr(""); setView("join"); }}>
            JOIN ▶
          </button>
        </section>
      )}

      {view === "host" && (
        <HostSetup
          lang={lang}
          busy={busy}
          onCancel={() => setView("hub")}
          onCreated={(created) => {
            setMode("host");
            setCode(created.code);
            setSeed(created.seed);
            setStep(0);
            setTally(null);
            setView("room");
          }}
          setBusy={setBusy}
          setErr={setErr}
        />
      )}

      {view === "join" && (
        <JoinRoom
          busy={busy}
          onCancel={() => setView("hub")}
          onJoined={(joined) => {
            setMode("player");
            setCode(joined.code);
            setTally(null);
            setView("room");
          }}
          setBusy={setBusy}
          setErr={setErr}
        />
      )}

      {playing && (
        <section className="aa-panel">
          <div className="aa-head">
            <span className="aa-count">
              {String(liveStep + 1).padStart(2, "0")} / {String(liveSeed.length || 0).padStart(2, "0")}
            </span>
            {/* 원본과 동일하게 ✕ 는 문항 카운터 바로 옆에 붙는다 */}
            <button className="aa-exit" onClick={leave} aria-label="exit">
              ✕
            </button>
          </div>

          {mode !== "solo" && code && (
            <p className="aa-note">
              ROOM {code}
              {countdown !== null && ` · ${countdown}s`}
            </p>
          )}

          {/* 호스트는 대기실에서 방 코드를 보여주고 시작 버튼을 쥔다 */}
          {mode === "host" && roomState?.phase === "lobby" ? (
            <>
              <h2 className="aa-title">{code}</h2>
              <p className="aa-note">참가자에게 이 코드와 비밀번호를 알려주세요</p>
              <p className={playerCount >= maxPlayers && maxPlayers > 0 ? "aa-full" : "aa-note"}>
                참가자 {playerCount} / {maxPlayers}
                {maxPlayers > 0 && playerCount >= maxPlayers && " · 정원이 찼어요"}
              </p>
              <button
                className="aa-btn aa-btn-primary"
                onClick={async () => {
                  if (!code || !roomState) return;
                  await patchRoom(code, {
                    ...roomState,
                    phase: "quiz",
                    step: 0,
                    deadline: Date.now() + roomState.timeLimit * 1000,
                  });
                }}
              >
                START ▶
              </button>
            </>
          ) : mode === "player" && roomState?.phase === "lobby" ? (
            <>
              <h2 className="aa-title">{code}</h2>
              <p className="aa-note">
                참가자 {playerCount} / {maxPlayers}
              </p>
              <p className="aa-note">호스트가 시작하기를 기다리는 중...</p>
            </>
          ) : current ? (
            <>
              <h2 className="aa-q">{current.q}</h2>
              {!tally ? (
                <div className="aa-opts">
                  <button className="aa-btn" disabled={busy} onClick={() => vote("a")}>
                    {current.a}
                  </button>
                  <button className="aa-btn" disabled={busy} onClick={() => vote("b")}>
                    {current.b}
                  </button>
                </div>
              ) : (
                <Result
                  a={current.a}
                  b={current.b}
                  tally={tally}
                  canAdvance={mode !== "player"}
                  onNext={advance}
                />
              )}
            </>
          ) : (
            <p className="aa-note">...</p>
          )}
        </section>
      )}

      {view === "end" && (
        <section className="aa-panel">
          <h2 className="aa-title">CLEAR!</h2>
          <p className="aa-note">{titleFor(plays, lang)}</p>
          <button className="aa-btn aa-btn-primary" onClick={startSolo}>
            ↻
          </button>
          <button className="aa-btn" onClick={() => setView("hub")}>
            HOME
          </button>
        </section>
      )}
    </main>
  );
}

function Result({
  a,
  b,
  tally,
  canAdvance,
  onNext,
}: {
  a: string;
  b: string;
  tally: Tally;
  canAdvance: boolean;
  onNext: () => void;
}) {
  const total = tally.a + tally.b;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <div className="aa-opts">
      <div className="aa-res">
        <span>{a}</span>
        <b>{pct(tally.a)}%</b>
        <i style={{ width: `${pct(tally.a)}%` }} />
      </div>
      <div className="aa-res">
        <span>{b}</span>
        <b>{pct(tally.b)}%</b>
        <i style={{ width: `${pct(tally.b)}%` }} />
      </div>
      <p className="aa-note">{total} votes</p>
      {canAdvance ? (
        <button className="aa-btn aa-btn-primary" onClick={onNext}>
          ▶
        </button>
      ) : (
        <p className="aa-note">호스트를 기다리는 중...</p>
      )}
    </div>
  );
}

function HostSetup({
  lang,
  busy,
  setBusy,
  setErr,
  onCreated,
  onCancel,
}: {
  lang: Lang;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string) => void;
  onCreated: (r: { code: string; seed: number[] }) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const [questions, setQuestions] = useState<number>(DEFAULT_ROUND_LENGTH);
  const [timeLimit, setTimeLimit] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState<number>(DEFAULT_ROOM_SIZE);

  const create = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pw, questions, timeLimit, lang, maxPlayers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "방 생성에 실패했어요");
        return;
      }
      onCreated({ code: data.code, seed: data.seed });
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="aa-panel">
      <h2 className="aa-title">HOST</h2>
      <label className="aa-note">비밀번호 (참가자 입장용)</label>
      <input className="aa-in" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="예: 1234" />
      <label className="aa-note">문항 수</label>
      <select className="aa-lang" value={questions} onChange={(e) => setQuestions(Number(e.target.value))}>
        {ROUND_LENGTHS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label className="aa-note">문항당 제한시간(초)</label>
      <select className="aa-lang" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
        {[10, 15, 20, 30].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label className="aa-note">정원 (이 인원이 차면 입장이 막힙니다)</label>
      <select className="aa-lang" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
        {ROOM_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}명
          </option>
        ))}
      </select>
      <button className="aa-btn aa-btn-primary" disabled={busy || !pw} onClick={create}>
        CREATE ▶
      </button>
      <button className="aa-btn" onClick={onCancel}>
        ← BACK
      </button>
    </section>
  );
}

function JoinRoom({
  busy,
  setBusy,
  setErr,
  onJoined,
  onCancel,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string) => void;
  onJoined: (r: { code: string }) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");

  const join = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "입장하지 못했어요");
        return;
      }
      onJoined({ code });
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="aa-panel">
      <h2 className="aa-title">JOIN</h2>
      <label className="aa-note">방 코드</label>
      <input className="aa-in" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 7842" inputMode="numeric" />
      <label className="aa-note">비밀번호</label>
      <input className="aa-in" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="예: 1234" />
      <button className="aa-btn aa-btn-primary" disabled={busy || !code || !pw} onClick={join}>
        ENTER ▶
      </button>
      <button className="aa-btn" onClick={onCancel}>
        ← BACK
      </button>
    </section>
  );
}
