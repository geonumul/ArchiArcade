"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/majors";
import { majorFor } from "@/lib/i18n/school";
import { Cabinet } from "@/components/Cabinet";
import { Picker } from "@/components/Picker";
import { useSchoolLang, withLang } from "@/components/useSchoolLang";

interface AlumniRow {
  id: string;
  displayName: string | null;
  major: string;
  gradYear: number | null;
  company: string | null;
  mine: boolean;
}

interface Me {
  directoryOptIn: boolean;
  displayName: string | null;
  gradYear: number | null;
  company: string | null;
}

export default function AlumniPage() {
  const { lang, t } = useSchoolLang();

  const [needVerify, setNeedVerify] = useState(false);
  const [school, setSchool] = useState<{ name: string } | null>(null);
  const [rows, setRows] = useState<AlumniRow[]>([]);
  const [major, setMajor] = useState<string>("");
  const [me, setMe] = useState<Me | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // 폼은 서버 값에서 시작하되 그 뒤로는 입력을 따라간다.
  const [optIn, setOptIn] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [formReady, setFormReady] = useState(false);

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      setErr("");
      try {
        const q = m ? `?major=${encodeURIComponent(m)}` : "";
        const res = await fetch(`/api/alumni${q}`, { cache: "no-store" });
        const d = await res.json();
        if (res.status === 403) {
          setNeedVerify(true);
          return;
        }
        if (!res.ok) {
          setErr(d.error ?? t.errNet);
          return;
        }
        setNeedVerify(false);
        setSchool(d.school);
        setRows(d.rows ?? []);
        setMe(d.me);
        setCanEdit(d.canEdit !== false);
      } catch {
        setErr(t.errNet);
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(major);
  }, [major, load]);

  // 서버에서 내 설정을 처음 받은 시점에만 폼을 채운다 — 이후 입력을 덮어쓰지 않는다.
  useEffect(() => {
    if (!me || formReady) return;
    setOptIn(me.directoryOptIn);
    setName(me.displayName ?? "");
    setYear(me.gradYear ? String(me.gradYear) : "");
    setCompany(me.company ?? "");
    setFormReady(true);
  }, [me, formReady]);

  const save = useCallback(async () => {
    setErr("");
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/alumni", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optIn, displayName: name, gradYear: year, company }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? t.errNet);
        return;
      }
      setSaved(true);
      await load(major);
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [optIn, name, year, company, major, load, t]);

  if (needVerify) {
    return (
      <Cabinet title={t.aTitle} hudRight="ALUMNI">
        <div className="note">{t.aNeed}</div>
        <Link className="btn kr" href={withLang("/verify", lang)}>
          {t.sVerify}
        </Link>
        <Link className="btn kr gray" href={withLang("/", lang)}>
          {t.back}
        </Link>
      </Cabinet>
    );
  }

  const majorOpts = [
    { value: "", main: t.aAll },
    ...MAJORS.map((m) => ({ value: m.code as string, main: majorFor(m.code, lang, MAJORS) })),
  ];

  return (
    <Cabinet title={t.aTitle} hudRight="ALUMNI">
      <div className="note">
        {school?.name ? `${school.name} · ` : ""}
        {t.aNote}
      </div>

      <Picker value={major} options={majorOpts} onChange={setMajor} label={t.aAll} />

      {loading ? (
        <div className="note">{t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="note">{t.aEmpty}</div>
      ) : (
        <>
          <div className="note">{t.aCount(rows.length)}</div>
          <div className="slist">
            {rows.map((r) => (
              <div key={r.id} className={"srow" + (r.mine ? " me" : "")}>
                <span>
                  {r.displayName || t.aAnon}
                  <span className="sub">
                    {majorFor(r.major, lang, MAJORS)}
                    {r.company ? ` · ${r.company}` : ""}
                  </span>
                </span>
                <b>{r.gradYear ? `'${String(r.gradYear).slice(-2)}` : "—"}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="comm-head" style={{ marginTop: 6 }}>
        ▼ {t.aMe} ▼
      </div>

      <label className="checkrow">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
        <span>
          {t.aOptIn}
          <span className="sub" style={{ display: "block", fontSize: 11, color: "var(--dim)" }}>
            {t.aOptInHint}
          </span>
        </span>
      </label>

      <div className="field">
        <label htmlFor="aName">{t.aName}</label>
        <input id="aName" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="aYear">{t.aYear}</label>
        <input
          id="aYear"
          value={year}
          inputMode="numeric"
          maxLength={4}
          placeholder="2027"
          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </div>

      <div className="field">
        <label htmlFor="aCompany">{t.aCompany}</label>
        <input
          id="aCompany"
          value={company}
          maxLength={40}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <div className="err">{err}</div>
      {saved && <div className="note" style={{ color: "var(--green)" }}>{t.aSaved}</div>}

      <button className="btn kr" disabled={busy || !canEdit} onClick={save}>
        {t.aSave}
      </button>
      <Link className="btn kr gray" href={withLang("/", lang)}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
