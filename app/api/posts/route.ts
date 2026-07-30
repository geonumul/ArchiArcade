import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { moderate } from "@/lib/moderation";
import { isLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOARDS = new Set(["ideas", "qfeedback"]);

export async function GET(req: Request) {
  const board = new URL(req.url).searchParams.get("board") ?? "ideas";
  if (!BOARDS.has(board)) return NextResponse.json({ error: "없는 게시판" }, { status: 400 });
  const posts = await store().listPosts(board, 50);
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`post:${ip}`, 5, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "글을 너무 자주 올리고 있어요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { board?: unknown; author?: unknown; text?: unknown; type?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const board = typeof body.board === "string" ? body.board : "";
  const author = (typeof body.author === "string" ? body.author : "").trim().slice(0, 16);
  const text = (typeof body.text === "string" ? body.text : "").trim();
  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";

  if (!BOARDS.has(board)) return NextResponse.json({ error: "없는 게시판" }, { status: 400 });
  if (!author || !text || text.length > 500) {
    return NextResponse.json({ error: "입력을 확인해주세요" }, { status: 400 });
  }

  // 게시 전 검열 — 키가 없으면 룰베이스만 돈다.
  const verdict = await moderate({ text, lang });
  if (prisma) {
    await prisma.moderationLog
      .create({
        data: {
          bodyHash: verdict.bodyHash,
          lang,
          engine: verdict.engine,
          ok: verdict.ok,
          reason: verdict.reason || null,
        },
      })
      .catch(() => undefined);
  }
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason || "게시할 수 없는 내용이에요", blocked: true }, { status: 422 });
  }

  const post = await store().addPost({
    board,
    author,
    body: text,
    type: typeof body.type === "string" ? body.type : null,
    lang,
  });
  return NextResponse.json({ post });
}
