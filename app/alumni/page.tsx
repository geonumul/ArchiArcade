"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/majors";
import { majorFor } from "@/lib/i18n/school";
import { Cabinet } from "@/components/Cabinet";
import { Picker } from "@/components/Picker";
import { SchoolName } from "@/components/SchoolName";
import { useSchoolLang, withLang } from "@/components/useSchoolLang";

interface AlumniRow {
  id: string;
  displayName: string | null;
  major: string;
  status: string;
  gradYear: number | null;
  company: string | null;
  mine: boolean;
}

interface Me {
  directoryOptIn: boolean;
  displayName: string | null;
  status: string;
  gradYear: number | null;
  company: string | null;
}

/// 운영자에게만 오는 학교 목록. total 은 인증자 수, listed 는 그중 공개에 동의한 수.
type AdminSchool = { domain: string; name: string; local: string | null; country: string; total: number; listed: number };

export default function AlumniPage() {
  const { lang, t } = useSchoolLang();

  const [needVerify, setNeedVerify] = useState(false);
  /* 운영자는 학교 인증 없이 전부 본다. 학교를 고르기 전에는 학교 목록만 받고,
     고르면 그 학교 사람 전부를 받는다 - 공개하지 않은 사람도 포함한다. */
  const [adminSchools, setAdminSchools] = useState<AdminSchool[] | null>(null);
  const [pickedSchool, setPickedSchool] = useState<string>("");
  const [school, setSchool] = useState<{ name: string; local?: string | null } | null>(null);
  const [rows, setRows] = useState<AlumniRow[]>([]);
  const [major, setMajor] = useState<string>("");
  // "" = 전체 · student = 재학 · alumni = 졸업
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [me, setMe] = useState<Me | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // 폼은 서버 값에서 시작하되 그 뒤로는 입력을 따라간다.
  const [optIn, setOptIn] = useState(false);
  const [name, setName] = useState("");
  // 재학 중이면 졸업연도를 묻지 않는다 — 아래에서 칸 자체가 사라진다.
  const [enrolled, setEnrolled] = useState(true);
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [formReady, setFormReady] = useState(false);

  const load = useCallback(
    async (m: string, st: string, sc: string) => {
      setLoading(true);
      setErr("");
      try {
        const qs = new URLSearchParams();
        if (m) qs.set("major", m);
        if (st) qs.set("status", st);
        if (sc) qs.set("school", sc);
        const q = qs.toString() ? `?${qs}` : "";
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
        /* 운영자가 학교를 고르지 않았으면 학교 목록이 온다. 명단이 아니라 고르는 화면이다. */
        if (d.admin && d.schools) {
          setAdminSchools(d.schools);
          setRows([]);
          return;
        }
        if (d.admin) setAdminSchools(null);
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
    load(major, statusFilter, pickedSchool);
  }, [major, statusFilter, pickedSchool, load]);

  // 서버에서 내 설정을 처음 받은 시점에만 폼을 채운다 — 이후 입력을 덮어쓰지 않는다.
  useEffect(() => {
    if (!me || formReady) return;
    setOptIn(me.directoryOptIn);
    setName(me.displayName ?? "");
    setEnrolled(me.status !== "alumni");
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
        body: JSON.stringify({
          optIn,
          displayName: name,
          status: enrolled ? "student" : "alumni",
          // 재학 중이면 연도를 보내지 않는다. 서버도 재학이면 비워 두므로,
          // 나중에 졸업으로 바꿀 때 옛 값이 되살아나지 않는다.
          gradYear: enrolled ? null : year,
          company,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? t.errNet);
        return;
      }
      setSaved(true);
      await load(major, statusFilter, pickedSchool);
    } catch {
      setErr(t.errNet);
    } finally {
      setBusy(false);
    }
  }, [optIn, name, enrolled, year, company, major, statusFilter, pickedSchool, load, t]);

  /* 운영자가 아직 학교를 고르지 않았다. 인증 안내가 아니라 고르는 화면을 보여 준다. */
  if (adminSchools) {
    return (
      <Cabinet title={t.aTitle} hudRight="ALUMNI">
        <div className="note">
          인증자가 있는 학교 {adminSchools.length}곳. 학교를 고르면 그 학교 인증자가 모두 보입니다.
        </div>
        <div className="playerlist" style={{ maxHeight: 320 }}>
          {adminSchools.map((s) => (
            <div className="pl-row" key={s.domain}>
              <button className="mini-btn" onClick={() => setPickedSchool(s.domain)}>
                {s.name}
              </button>
              <span style={{ color: "var(--dim)", fontSize: 11 }}>
                {s.total}명 · 공개 {s.listed}명
              </span>
            </div>
          ))}
        </div>
        <Link className="btn kr gray" href={withLang("/", lang)}>
          {t.back}
        </Link>
      </Cabinet>
    );
  }

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
        {school?.name ? (
          <>
            <SchoolName name={school.name} local={school.local} /> ·{" "}
          </>
        ) : null}
        {t.aNote}
      </div>

      <Picker
        value={statusFilter}
        options={[
          // 학교 순위의 "전체" 와 같은 말이라 그 문구를 그대로 쓴다.
          { value: "", main: t.sAll },
          { value: "student", main: t.aFilterStudent },
          { value: "alumni", main: t.aFilterAlumni },
        ]}
        onChange={setStatusFilter}
        label={t.aFilterStudent}
      />

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
                {/* 재학생은 연도가 없으므로 상태만, 졸업생은 상태 + 연도를 보여 준다. */}
                <b>
                  {r.status === "alumni"
                    ? `${t.aTagAlumni}${r.gradYear ? ` '${String(r.gradYear).slice(-2)}` : ""}`
                    : t.aTagStudent}
                </b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="comm-head" style={{ marginTop: 6 }}>
        ▼ {t.aMe} ▼
      </div>

      {/* 이미 공개 중이면 그 사실을 먼저 알린다 - 여기가 수정하는 자리라는 게 분명해야 한다. */}
      {me?.directoryOptIn && (
        <div className="note" style={{ color: "var(--yellow)" }}>{t.aListed}</div>
      )}

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

      <label className="checkrow">
        <input
          type="checkbox"
          checked={enrolled}
          onChange={(e) => setEnrolled(e.target.checked)}
        />
        <span>
          {t.aEnrolled}
          <span className="sub" style={{ display: "block", fontSize: 11, color: "var(--dim)" }}>
            {t.aEnrolledHint}
          </span>
        </span>
      </label>

      {/* 재학 중이면 졸업연도 칸이 사라진다. 졸업하고 체크를 풀면 다시 나타난다. */}
      {!enrolled && (
        <div className="field">
          <label htmlFor="aYear">{t.aYearGrad}</label>
          <input
            id="aYear"
            value={year}
            inputMode="numeric"
            maxLength={4}
            placeholder="2027"
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
      )}

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
        {me?.directoryOptIn ? t.aSaveEdit : t.aSave}
      </button>
      <Link className="btn kr gray" href={withLang("/", lang)}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
