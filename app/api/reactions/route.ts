import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { hasDatabase, prisma } from "@/lib/db";
import { BANK_SIZE } from "@/lib/game/bank";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 문항별 🔥/😑 반응. 어떤 문항이 재미있고 어떤 게 죽었는지 가리는 신호이며,
/// 문항 개편 때 무엇을 갈아끼울지 정하는 근거가 된다.
export async function GET(req: Request) {
  const idx = Number(new URL(req.url).searchParams.get("idx"));
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE) {
    return NextResponse.json({ error: "잘못된 idx" }, { status: 400 });
  }
  if (!hasDatabase || !prisma) return NextResponse.json({ idx, hot: 0, meh: 0 });

  const row = await prisma.questionReact.findUnique({ where: { questionIdx: idx } });
  return NextResponse.json({ idx, hot: row?.hot ?? 0, meh: row?.meh ?? 0 });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`react:${ip}`, 60, 60);
  if (!rl.allowed) return NextResponse.json({ error: "too many" }, { status: 429 });

  let body: { idx?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const idx = Number(body.idx);
  const kind = body.kind === "hot" || body.kind === "meh" ? body.kind : null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= BANK_SIZE || !kind) {
    return NextResponse.json({ error: "잘못된 값" }, { status: 400 });
  }

  const counts = await store().reactQuestion(idx, kind);
  return NextResponse.json({ idx, ...counts });
}
