import { NextResponse } from "next/server";
import { moderate } from "@/lib/moderation";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 검열은 반드시 서버를 경유한다. 클라이언트는 API 키를 절대 보지 않는다.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`moderate:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, reason: "너무 자주 요청했어요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { text?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const lang = typeof body.lang === "string" ? body.lang : undefined;
  if (!text.trim() || text.length > 2000) {
    return NextResponse.json({ ok: false, reason: "길이가 올바르지 않아요" }, { status: 400 });
  }

  const result = await moderate({ text, lang });

  // 감사 로그 — 원문이 아니라 해시만 남긴다.
  if (prisma) {
    await prisma.moderationLog
      .create({
        data: {
          bodyHash: result.bodyHash,
          lang: lang ?? "unknown",
          engine: result.engine,
          ok: result.ok,
          reason: result.reason || null,
        },
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: result.ok, reason: result.reason, engine: result.engine });
}
