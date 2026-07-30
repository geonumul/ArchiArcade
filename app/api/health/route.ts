import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { hasUpstash } from "@/lib/ratelimit";
import { AI_ENABLED } from "@/lib/moderation";
import { store } from "@/lib/store";
import { verifyBanks, BANK_SIZE } from "@/lib/game/bank";
import { LANGS } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 배포·로컬 어디서든 "지금 무엇이 켜져 있고 무엇이 폴백인지"를 한 번에 보여준다.
export async function GET() {
  const banks = verifyBanks();
  return NextResponse.json({
    ok: banks.ok,
    storage: {
      backend: store().backend,
      database: hasDatabase ? "configured" : "missing (in-memory fallback)",
    },
    rateLimit: hasUpstash ? "upstash" : "in-memory fallback",
    moderation: AI_ENABLED ? "rules + ai" : "rules only (ANTHROPIC_API_KEY 미설정)",
    banks: {
      languages: LANGS.length,
      perLanguage: BANK_SIZE,
      total: LANGS.length * BANK_SIZE,
      problems: banks.problems,
    },
  });
}
