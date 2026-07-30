"use client";

import { useCallback, useEffect, useState } from "react";
import { dict, LANGS, LANG_LABELS, type Lang } from "@/lib/i18n";

interface Post {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

type Board = "ideas" | "qfeedback";

/**
 * 게임 신청 보드 · 질문 공작소.
 *
 * 원본의 vSuggest / vReport 두 화면을 옮긴 것이다. 글은 서버를 거치며 검열되는데,
 * ANTHROPIC_API_KEY 가 없으면 룰베이스만 돌고 키가 붙으면 문맥 판정이 더해진다.
 * 화면은 어느 쪽인지 알 필요가 없다.
 */
export default function BoardsPage() {
  const [lang, setLang] = useState<Lang>("ko");
  const [board, setBoard] = useState<Board>("ideas");
  const [posts, setPosts] = useState<Post[]>([]);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const d = dict(lang) as unknown as Record<string, unknown>;
  const s = (k: string, fallback = "") => String(d[k] ?? fallback);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts?board=${board}`, { cache: "no-store" });
      const j = (await res.json()) as { posts?: Post[] };
      setPosts(j.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [board]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setErr("");
    if (!author.trim()) return setErr(s("auErrName", "이름을 입력해주세요"));
    if (!text.trim()) return setErr(board === "ideas" ? s("needIdea") : s("needBug"));

    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ board, author, text, lang }),
      });
      const j = await res.json();
      if (!res.ok) {
        // 검열에 걸린 경우 서버가 사유를 돌려준다.
        setErr(j.error ?? s("modErr", "게시할 수 없어요"));
        return;
      }
      setText("");
      await load();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const empty = board === "ideas" ? s("emptyIdeas") : s("emptyBugs");
  const title = board === "ideas" ? s("sgTitle") : s("wsTitle");
  const btn = board === "ideas" ? s("btnPostIdea") : s("btnPostBug");

  return (
    <main className="aa-shell">
      <header className="aa-bar">
        <a className="aa-brand" href="/" style={{ textDecoration: "none" }}>
          ← ARCHIARCADE
        </a>
        <select className="aa-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_LABELS[l]}
            </option>
          ))}
        </select>
      </header>

      <section className="aa-panel">
        <div className="aa-tabs">
          <button
            className={board === "ideas" ? "aa-tab aa-tab-on" : "aa-tab"}
            onClick={() => setBoard("ideas")}
          >
            {s("sgTitle")}
          </button>
          <button
            className={board === "qfeedback" ? "aa-tab aa-tab-on" : "aa-tab"}
            onClick={() => setBoard("qfeedback")}
          >
            {s("wsTitle")}
          </button>
        </div>

        <h1 className="aa-sub">{title}</h1>

        {err && <p className="aa-err">{err}</p>}

        <input
          className="aa-in"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={board === "ideas" ? s("phSgName") : s("phBgName")}
          maxLength={16}
        />
        <textarea
          className="aa-in"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={board === "ideas" ? s("phSgText") : s("phBgText")}
          rows={3}
          maxLength={500}
        />
        <button className="aa-btn aa-btn-primary" disabled={busy} onClick={submit}>
          {busy ? s("modChecking", "확인 중...") : btn}
        </button>
      </section>

      <section className="aa-panel">
        {loading ? (
          <p className="aa-note">…</p>
        ) : posts.length === 0 ? (
          <p className="aa-note">{empty}</p>
        ) : (
          <div className="aa-opts">
            {posts.map((p) => (
              <div key={p.id} className="aa-res" style={{ display: "block" }}>
                <div style={{ fontSize: 13 }}>{p.body}</div>
                <div className="aa-note" style={{ textAlign: "right", marginTop: 6, fontSize: 11 }}>
                  — {p.author}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
