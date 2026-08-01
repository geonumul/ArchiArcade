import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { hasUpstash } from "@/lib/ratelimit";
import { ADMIN_CONFIGURED } from "@/lib/auth";
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
    /* 관리자 이름이 설정돼 있는지. 값은 안 내보내고 설정 여부만 본다.
       이게 꺼져 있으면 OP ROOM 도, 게시판 지우기도, 동문 전체 보기도 조용히 안 된다.
       화면에는 아무 표시가 없어서 배포 환경에 변수를 안 넣은 것을 알 길이 없었다. */
    admin: ADMIN_CONFIGURED ? "configured" : "ADMIN_NAME 미설정 - 관리자 기능 전부 꺼짐",
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
