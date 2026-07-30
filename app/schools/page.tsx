"use client";

import { useEffect, useState } from "react";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = country ? `?country=${country}` : "";
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
    <main className="aa-shell">
      <header className="aa-bar">
        <span className="aa-brand">SCHOOL RANKING</span>
        <a className="aa-lang" href="/" style={{ textDecoration: "none", textAlign: "center" }}>
          ← HOME
        </a>
      </header>

      <section className="aa-panel">
        <h1 className="aa-title">학교 순위</h1>
        <p className="aa-note">인증된 학생의 표만 집계됩니다.</p>

        {countries.length > 1 && (
          <select className="aa-lang" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">전체</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {mine && (
          <p className={mine.rank ? "aa-note" : "aa-full"}>
            {mine.rank
              ? `우리 학교(${mine.schoolName}) — ${mine.rank}위`
              : `우리 학교(${mine.schoolName})는 아직 순위에 없어요. 한 판 하면 올라갑니다`}
          </p>
        )}

        {loading ? (
          <p className="aa-note">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="aa-note">
            아직 인증한 학생이 없어요.
            <br />
            첫 번째가 되어보세요.
          </p>
        ) : (
          <div className="aa-opts">
            {rows.map((r, i) => {
              const isMine = mine?.schoolDomain === r.schoolDomain;
              return (
                <div key={r.schoolDomain} className="aa-res" style={isMine ? { borderColor: "#ffd93d" } : undefined}>
                  <span>
                    {i + 1}. {r.schoolName}
                  </span>
                  <b>
                    {r.votes.toLocaleString()}표 · {r.students}명
                  </b>
                </div>
              );
            })}
          </div>
        )}

        <a className="aa-btn aa-btn-primary" href="/verify" style={{ textDecoration: "none", textAlign: "center" }}>
          학교 인증하기 ▶
        </a>
      </section>
    </main>
  );
}
