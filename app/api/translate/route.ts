import { NextResponse } from "next/server";
import { hasDatabase, db } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 게시글 번역.
 *
 * 일본어로 보는 사람에게 한국어 글이 그대로 뜨면 무슨 말인지 모른다. 그렇다고 원문을
 * 감추면 누가 어디서 쓴 글인지 사라지므로, 번역을 보여 주고 원래 언어는 따로 표시한다.
 *
 * 한 번 번역한 것은 표에 두고 다시 쓴다. 글은 고쳐지지 않으므로 번역이 낡을 일이 없다.
 *
 * 키가 없으면 조용히 빈 결과를 준다. 번역이 안 되는 것과 화면이 깨지는 것은 다르다 -
 * 못 하면 원문이 그대로 보이면 된다.
 *
 *   POST /api/translate { ids: [글id, ...], to: "ja" }  →  { [id]: "번역문" }
 */

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.TRANSLATE_MODEL || process.env.MODERATION_MODEL || "claude-sonnet-4-6";
const TRANSLATE_ENABLED = Boolean(KEY);

/// 한 번에 너무 많이 부르면 느리고 비싸다. 피드는 세 줄만 쓰므로 넉넉하다.
const MAX_ITEMS = 12;
const MAX_CHARS = 400;

const LANG_NAME: Record<string, string> = {
  ko: "Korean", en: "English", zh: "Simplified Chinese", tw: "Traditional Chinese",
  ja: "Japanese", fr: "French", it: "Italian", de: "German", es: "Spanish",
};

async function translate(texts: string[], to: string): Promise<string[] | null> {
  if (!KEY) return null;
  /* 한 번의 호출로 여러 줄을 옮긴다. 줄마다 부르면 세 줄짜리 피드에 세 번 나가고,
     그만큼 느려지고 비싸진다. 번호를 붙여 보내고 같은 번호로 돌려받는다. */
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt =
    `Translate each numbered line into ${LANG_NAME[to] ?? to}. ` +
    `These are short posts from a game community, so keep the casual tone. ` +
    `Reply with the same numbering and nothing else - no notes, no explanations.\n\n${numbered}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { content?: Array<{ text?: string }> };
    const out = d.content?.map((c) => c.text ?? "").join("") ?? "";

    /* 번호를 보고 되돌린다. 한 줄이라도 빠지면 엉뚱한 글에 엉뚱한 번역이 붙으므로,
       못 찾은 자리는 비워 두고 그 글만 원문으로 남긴다. */
    const got: string[] = new Array(texts.length).fill("");
    for (const line of out.split("\n")) {
      const m = line.match(/^\s*(\d+)\.\s*(.+)$/);
      if (!m) continue;
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < got.length) got[i] = m[2].trim();
    }
    return got;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({});

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`tr:${ipKey(ip)}`, 30, 600);
  if (!rl.allowed) return NextResponse.json({});

  let body: { ids?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const to = typeof body.to === "string" && isLang(body.to) ? body.to : null;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, MAX_ITEMS) : [];
  if (!to || !ids.length) return NextResponse.json({});

  const prisma = db();
  const rows = await prisma.report.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, body: true, lang: true },
  });

  // 같은 언어로 쓰인 글은 옮길 것이 없다.
  const need = rows.filter((r) => r.lang !== to);
  if (!need.length) return NextResponse.json({});

  const cached = await prisma.reportTranslation.findMany({
    where: { lang: to, reportId: { in: need.map((r) => r.id) } },
    select: { reportId: true, body: true },
  });
  const out: Record<string, string> = {};
  cached.forEach((c) => (out[c.reportId] = c.body));

  const missing = need.filter((r) => !out[r.id]);
  if (missing.length && TRANSLATE_ENABLED) {
    const done = await translate(missing.map((r) => r.body.slice(0, MAX_CHARS)), to);
    if (done) {
      const save: Array<{ reportId: string; lang: string; body: string }> = [];
      missing.forEach((r, i) => {
        const t = done[i];
        if (!t) return;
        out[r.id] = t;
        save.push({ reportId: r.id, lang: to, body: t });
      });
      if (save.length) {
        await prisma.reportTranslation.createMany({ data: save, skipDuplicates: true }).catch(() => null);
      }
    }
  }

  return NextResponse.json(out);
}
