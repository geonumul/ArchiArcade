"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";
import {
  SPONSOR_UI,
  toSponsorLang,
  type InquiryKind,
  type SponsorLang,
} from "@/lib/i18n/sponsor";

/**
 * 스폰서·제휴 창구.
 *
 * 이 화면은 학생이 아니라 예산을 집행하는 쪽이 본다. 그래서 오락실과 같은 캐비닛
 * 안에 두되(같은 곳이라는 것이 보여야 한다) 게임 화면에서 링크로 이어지지 않고
 * 푸터에서만 들어오게 한다 - 놀러 온 사람의 동선에 영업 화면을 끼워 넣지 않는다.
 *
 * 숫자는 서버가 주는 것만 그린다. 화면에 상수로 적어 두면 반드시 낡는다.
 */

interface Metrics {
  votes: number;
  plays: number;
  langs: number;
  questions: number;
}

type Step = "form" | "done";

export function SponsorDesk() {
  const [lang, setLang] = useState<SponsorLang>("ko");
  const t = SPONSOR_UI[lang];

  const [nums, setNums] = useState<Metrics | null>(null);
  const [step, setStep] = useState<Step>("form");

  const [org, setOrg] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<InquiryKind>("cartridge");
  const [message, setMessage] = useState("");

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 학교 페이지들과 같은 이유로 location 을 직접 읽는다 — useSearchParams 는 프리렌더에
  // Suspense 경계를 요구한다. 첫 프레임만 한국어로 그려지고 곧바로 맞는 언어가 된다.
  useEffect(() => {
    setLang(toSponsorLang(new URLSearchParams(window.location.search).get("lang")));
  }, []);

  useEffect(() => {
    fetch("/api/sponsor/inquiry", { cache: "no-store" })
      .then((r) => r.json())
      .then(setNums)
      .catch(() => undefined);
  }, []);

  const send = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/sponsor/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org, contact, email, kind, message, lang }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) {
        // 서버는 어느 칸이 문제인지만 알려 준다. 문구는 화면이 고른다.
        setErr(
          d.error === "org"
            ? t.eOrg
            : d.error === "email"
              ? t.eEmail
              : d.error === "message"
                ? t.eMsg
                : (d.error ?? t.errNet)
        );
        return;
      }
      setStep("done");
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [org, contact, email, kind, message, lang, t]);

  const home = `/?lang=${lang}`;

  if (step === "done") {
    return (
      <Cabinet title={t.doneTitle} hudRight="SPONSOR">
        <div className="note">{t.done}</div>
        <div className="note">{t.doneNote}</div>
        <button
          className="btn kr gray"
          onClick={() => {
            setMessage("");
            setStep("form");
          }}
        >
          {t.again}
        </button>
        <Link className="btn kr" href={home}>
          {t.back}
        </Link>
      </Cabinet>
    );
  }

  return (
    <Cabinet title={t.title} hudRight="SPONSOR">
      <div className="note">{t.intro}</div>

      <div className="field">
        <label>{t.numsTitle}</label>
        {/*
          누적 플레이(t.nPlays)는 서버가 주지만 지금은 그리지 않는다.
          투표 1,591 옆에 플레이 18 이 서면 한 판에 88표라는 계산이 나와 앞뒤가 맞지
          않아 보이고, 스폰서가 숫자를 의심하기 시작하면 나머지 숫자도 같이 죽는다.
          플레이 카운터가 투표와 아귀가 맞을 만큼 쌓이면 여기 한 줄로 되살리면 된다.
        */}
        <div className="scoreboard">
          <span className="lbl">{t.nVotes}</span>
          <span className="val">{nums ? nums.votes.toLocaleString() : "—"}</span>
          <br />
          <span className="lbl">{t.nLangs}</span>
          <span className="val">{nums ? nums.langs : "—"}</span>
          <br />
          <span className="lbl">{t.nQuestions}</span>
          <span className="val">{nums ? nums.questions : "—"}</span>
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          {t.numsNote}
        </div>
      </div>

      <div className="field">
        <label>{t.whoTitle}</label>
        <div className="note">{t.who}</div>
      </div>

      <div className="field">
        <label>{t.offerTitle}</label>
        {t.offers.map((o) => (
          <div key={o.kind} className="note" style={{ marginBottom: 10 }}>
            <b style={{ color: "var(--ink)" }}>{o.name}</b>
            <br />
            {o.desc}
          </div>
        ))}
      </div>

      <div className="field">
        <label>{t.ruleTitle}</label>
        <div className="note">{t.rule}</div>
      </div>

      <div className="field">
        <label>{t.formTitle}</label>
      </div>

      <div className="field">
        <label>{t.fOrg}</label>
        <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t.fOrgPh} maxLength={80} />
      </div>

      <div className="field">
        <label>{t.fName}</label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t.fNamePh}
          maxLength={40}
        />
      </div>

      <div className="field">
        <label>{t.fEmail}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.fEmailPh}
          maxLength={120}
        />
      </div>

      <div className="field">
        <label>{t.fKind}</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as InquiryKind)}>
          {t.offers.map((o) => (
            <option key={o.kind} value={o.kind}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t.fMsg}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.fMsgPh}
          maxLength={2000}
          rows={6}
        />
      </div>

      <div className="err">{err}</div>

      <button
        className="btn kr"
        disabled={busy || !org.trim() || !email.includes("@") || message.trim().length < 10}
        onClick={send}
      >
        {busy ? t.fSending : t.fSend}
      </button>

      <div className="note">{t.fPrivacy}</div>

      <Link className="btn kr gray" href={home}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
