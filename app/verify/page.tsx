"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/majors";
import { majorFor } from "@/lib/i18n/school";
import { Cabinet } from "@/components/Cabinet";
import { Picker } from "@/components/Picker";
import { SchoolName } from "@/components/SchoolName";
import { useSchoolLang, withLang } from "@/components/useSchoolLang";

interface Badge {
  schoolDomain: string;
  /// 영문 이름. 크게 쓴다.
  schoolName: string;
  /// 현지어 이름. 영문 옆에 작게 붙는다. 출처가 없는 학교는 비어 있다.
  schoolLocal?: string | null;
  country: string;
  major: string;
}

type Step = "form" | "code" | "done";

export default function VerifyPage() {
  const { lang, t } = useSchoolLang();

  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState<string>(MAJORS[0].code);
  const [code, setCode] = useState("");
  const [badge, setBadge] = useState<Badge | null>(null);
  const [school, setSchool] = useState<{ name: string } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * 재발송까지 남은 시간.
   *
   * 서버는 한 주소에 10분 동안 3번까지만 보낸다. 버튼을 계속 눌러 그 한도를 다 쓰고
   * 나면 정작 필요할 때 못 보내므로, 화면에서도 한 번 더 텀을 둔다.
   */
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    fetch("/api/verify/me")
      .then((r) => r.json())
      .then((d: { badge: Badge | null }) => {
        if (d.badge) {
          setBadge(d.badge);
          setMajor(d.badge.major);
          setStep("done");
        }
      })
      .catch(() => undefined);

    // 로그인해 있으면 가입할 때 쓴 주소를 미리 채운다 — 같은 주소를 두 번 적게 하지 않는다.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user?: { email?: string | null } | null }) => {
        if (d.user?.email) setEmail((cur) => cur || d.user!.email!);
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
        // 서버 문구는 한국어라, 화면이 아는 상황이면 현재 언어로 바꿔 보여 준다.
        setErr(d.mailNotReady ? t.vMailSoon : (d.error ?? t.errNet));
        return;
      }
      setSchool(d.school);
      setDevCode(d.devCode ?? null);
      setStep("code");
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [email, major, t]);

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
        setErr(d.error ?? t.errNet);
        return;
      }
      setBadge(d.badge);
      setStep("done");
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [email, code, major, t]);

  /**
   * 코드를 다시 보낸다.
   *
   * 서버는 한 주소에 10분 동안 3번까지만 보내므로, 여기서도 30초 텀을 둔다.
   * 버튼을 연타해 한도를 다 써 버리면 정작 필요할 때 못 받는다.
   */
  const resend = useCallback(async () => {
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
        setErr(d.mailNotReady ? t.vMailSoon : (d.error ?? t.errNet));
        return;
      }
      setDevCode(d.devCode ?? null);
      setCode("");
      setErr(t.vResent);
      setCooldown(30);
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [email, major, t]);

  const reset = useCallback(async () => {
    await fetch("/api/verify/me", { method: "DELETE" });
    setBadge(null);
    setStep("form");
    setCode("");
    setDevCode(null);
  }, []);

  const majorOpts = MAJORS.map((m) => ({ value: m.code as string, main: majorFor(m.code, lang, MAJORS) }));

  const title = step === "code" ? t.vCodeTitle : step === "done" ? `✓ ${t.vDone}` : t.vTitle;

  return (
    <Cabinet title={title} hudRight="BADGE">
      {step === "form" && (
        <>
          <div className="note">{t.vIntro}</div>

          <div className="field">
            <label htmlFor="vEmail">{t.vEmail}</label>
            <input
              id="vEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="archiarcade@snu.ac.kr"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div className="field">
            <label>{t.vMajor}</label>
            <Picker value={major} options={majorOpts} onChange={setMajor} label={t.vMajor} />
          </div>

          <div className="err">{err}</div>
          <button className="btn kr" disabled={busy || !email.includes("@")} onClick={request}>
            {t.vSend}
          </button>
          <div className="note">{t.vPrivacy}</div>
        </>
      )}

      {step === "code" && (
        <>
          <div className="note">{t.vCodeSent(school?.name ?? "", email)}</div>

          {devCode && (
            <div className="note" style={{ color: "var(--yellow)" }}>
              {t.vDevCode} - <b>{devCode}</b>
            </div>
          )}

          <div className="field">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ textAlign: "center", fontSize: 24, letterSpacing: 8 }}
            />
          </div>

          {/* 코드가 안 와서 그냥 나가는 사람이 실제로 있었다. 어디를 봐야 하는지
              알려 주고, 다시 받을 길을 여기 둔다. */}
          <div className="note" style={{ fontSize: 12, color: "var(--dim)" }}>{t.vSpam}</div>

          <div className="err">{err}</div>
          <button className="btn kr" disabled={busy || code.length !== 6} onClick={confirm}>
            {t.vConfirm}
          </button>
          <button className="btn kr gray" disabled={busy || cooldown > 0} onClick={resend}>
            {cooldown > 0 ? t.vWait(cooldown) : t.vResend}
          </button>
          <button className="btn kr gray" onClick={() => setStep("form")}>
            {t.vRetry}
          </button>
        </>
      )}

      {step === "done" && badge && (
        <>
          <div className="scoreboard">
            <span className="lbl">SCHOOL</span>
            <span className="val"><SchoolName name={badge.schoolName} local={badge.schoolLocal} /></span>
            <br />
            <span className="lbl">MAJOR</span>
            <span className="val">{majorFor(badge.major, lang, MAJORS)}</span>
          </div>

          <div className="note">{t.vDoneNote}</div>
          <div className="err">{err}</div>

          <Link className="btn kr" href={withLang("/alumni", lang)}>
            {t.aTitle} ▶
          </Link>
          <Link className="btn kr gray" href={withLang("/schools", lang)}>
            {t.sTitle} ▶
          </Link>
          <Link className="btn kr gray" href={withLang("/", lang)}>
            {t.vPlay}
          </Link>
          <button className="btn kr gray" onClick={reset}>
            {t.vUnbadge}
          </button>
        </>
      )}
    </Cabinet>
  );
}
