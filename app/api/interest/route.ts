import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { hasDatabase, prisma } from "@/lib/db";
import { isLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURES = new Set(["team", "crit", "res", "match"]);

/// 커뮤니티 기능별 관심도. 어느 언어권에서 무엇을 원하는지가 곧 시장 조사 데이터다.
export async function GET() {
  if (!hasDatabase || !prisma) return NextResponse.json({ counts: {} });

  const rows = await prisma.featureInterest.groupBy({
    by: ["feature"],
    _sum: { count: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.feature] = r._sum.count ?? 0;
  return NextResponse.json({ counts });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`interest:${ip}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "too many" }, { status: 429 });
  }

  let body: { feature?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const feature = typeof body.feature === "string" ? body.feature : "";
  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";
  if (!FEATURES.has(feature)) {
    return NextResponse.json({ error: "없는 기능" }, { status: 400 });
  }

  const count = await store().bumpInterest(feature, lang);
  return NextResponse.json({ count });
}
