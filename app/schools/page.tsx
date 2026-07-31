"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";
import { Picker } from "@/components/Picker";
import { useSchoolLang, withLang } from "@/components/useSchoolLang";

interface Row {
  schoolDomain: string;
  schoolName: string;
  country: string;
  students: number;
  votes: number;
}

interface Mine {
  schoolDomain: string;
  schoolName: string;
  rank: number | null;
}

export default function SchoolsPage() {
  const { lang, t } = useSchoolLang();

  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = country ? `?country=${encodeURIComponent(country)}` : "";
    fetch(`/api/schools/ranking${q}`)
      .then((r) => r.json())
      .then((d: { rows: Row[]; mine: Mine | null; countries?: string[] }) => {
        setRows(d.rows ?? []);
        setMine(d.mine ?? null);
        if (d.countries) setCountries(d.countries);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <Cabinet title={t.sTitle} hudRight="RANKING">
      <div className="note">{t.sNote}</div>
      {/* 순위를 보면 바로 "그래서 표는 어떻게 얻나" 가 궁금해진다. 그 자리에 답을 둔다. */}
      <div className="note" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--dim)" }}>
        {t.sHow}
      </div>

      {countries.length > 1 && (
        <Picker
          value={country}
          options={[{ value: "", main: t.sAll }, ...countries.map((c) => ({ value: c, main: c }))]}
          onChange={setCountry}
          label={t.sTitle}
        />
      )}

      {mine && (
        <div className="note" style={mine.rank ? { color: "var(--yellow)" } : undefined}>
          {mine.rank ? t.sMine(mine.schoolName, mine.rank) : t.sMineNo(mine.schoolName)}
        </div>
      )}

      {loading ? (
        <div className="note">{t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="note">{t.sEmpty}</div>
      ) : (
        <div className="slist">
          {rows.map((r, i) => (
            <div
              key={r.schoolDomain}
              className={"srow" + (mine?.schoolDomain === r.schoolDomain ? " me" : "")}
            >
              <span>
                {i + 1}. {r.schoolName}
                <span className="sub">{r.country}</span>
              </span>
              <b>
                {r.votes.toLocaleString()} {t.sVotes} · {r.students} {t.sStudents}
              </b>
            </div>
          ))}
        </div>
      )}

      <Link className="btn kr" href={withLang("/verify", lang)}>
        {t.sVerify}
      </Link>
      <Link className="btn kr gray" href={withLang("/", lang)}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
