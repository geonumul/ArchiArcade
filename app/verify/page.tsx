"use client";

import { useCallback, useEffect, useState } from "react";
import { MAJORS } from "@/lib/majors";

interface Badge {
  schoolDomain: string;
  schoolName: string;
  country: string;
  major: string;
}

type Step = "form" | "code" | "done";

export default function VerifyPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState<string>(MAJORS[0].code);
  const [code, setCode] = useState("");
  const [badge, setBadge] = useState<Badge | null>(null);
  const [school, setSchool] = useState<{ name: string } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/verify/me")
      .then((r) => r.json())
      .then((d: { badge: Badge | null }) => {
        if (d.badge) {
          setBadge(d.badge);
          setStep("done");
        }
      })
      .catch(() => undefined);
  }, []);

  const request = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, major }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? "요청에 실패했어요");
        return;
      }
      setSchool(d.school);
      setDevCode(d.devCode ?? null);
      setStep("code");
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }, [email, major]);

  const confirm = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, major }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? "인증에 실패했어요");
        return;
      }
      setBadge(d.badge);
      setStep("done");
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }, [email, code, major]);

  const reset = useCallback(async () => {
    await fetch("/api/verify/me", { method: "DELETE" });
    setBadge(null);
    setStep("form");
    setCode("");
    setDevCode(null);
  }, []);

  const majorLabel = (c: string) => MAJORS.find((m) => m.code === c)?.ko ?? c;

  return (
    <main className="aa-shell">
      <header className="aa-bar">
        <span className="aa-brand">STUDENT BADGE</span>
        <a className="aa-lang" href="/" style={{ textDecoration: "none", textAlign: "center" }}>
          ← HOME
        </a>
      </header>

      {err && <p className="aa-err">{err}</p>}

      {step === "form" && (
        <section className="aa-panel">
          <h1 className="aa-title">학교 인증</h1>
          <p className="aa-note">
            학교 메일로 인증하면 뱃지가 붙고, 학교별 순위와 우리 학교 커뮤니티에 참여할 수 있어요.
            <br />
            가입은 필요 없습니다.
          </p>

          <label className="aa-note">학교 메일</label>
          <input
            className="aa-in"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="예: hong@hongik.ac.kr"
            autoComplete="email"
          />

          <label className="aa-note">학과</label>
          <select className="aa-lang" value={major} onChange={(e) => setMajor(e.target.value)}>
            {MAJORS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.ko}
              </option>
            ))}
          </select>

          <button className="aa-btn aa-btn-primary" disabled={busy || !email} onClick={request}>
            인증 코드 받기 ▶
          </button>
          <p className="aa-note" style={{ fontSize: 11 }}>
            이메일은 학교 확인에만 쓰이고, 광고 메일은 보내지 않습니다.
          </p>
        </section>
      )}

      {step === "code" && (
        <section className="aa-panel">
          <h1 className="aa-title">코드 입력</h1>
          <p className="aa-note">
            {school?.name} 확인됨
            <br />
            {email} 로 6자리 코드를 보냈어요 (10분 안에 입력)
          </p>

          {devCode && (
            <p className="aa-full">
              개발 모드 — 메일 발송이 꺼져 있어 코드를 여기 표시합니다: {devCode}
            </p>
          )}

          <input
            className="aa-in"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            style={{ textAlign: "center", fontSize: 22, letterSpacing: 6 }}
          />

          <button className="aa-btn aa-btn-primary" disabled={busy || code.length !== 6} onClick={confirm}>
            인증하기 ▶
          </button>
          <button className="aa-btn" onClick={() => setStep("form")}>
            ← 주소 다시 입력
          </button>
        </section>
      )}

      {step === "done" && badge && (
        <section className="aa-panel">
          <h1 className="aa-title">✓ 인증 완료</h1>
          <div className="aa-res" style={{ display: "block", textAlign: "center" }}>
            <div style={{ fontSize: 18 }}>{badge.schoolName}</div>
            <div className="aa-note" style={{ marginTop: 6 }}>
              {majorLabel(badge.major)}
            </div>
          </div>
          <p className="aa-note">
            이제 이 브라우저에서 뱃지가 유지됩니다. 학교별 순위 집계에도 반영돼요.
          </p>
          <a className="aa-btn aa-btn-primary" href="/" style={{ textDecoration: "none", textAlign: "center" }}>
            게임하러 가기 ▶
          </a>
          <button className="aa-btn" onClick={reset}>
            뱃지 해제
          </button>
        </section>
      )}
    </main>
  );
}
