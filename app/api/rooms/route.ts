import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { hashPassword } from "@/lib/auth";
import { drawRound, makeRoomCode, DEFAULT_ROUND_LENGTH, ROUND_LENGTHS } from "@/lib/game/round";
import { rateLimit } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 방 생성. 코드는 서버가 뽑고, 비밀번호는 해시만 저장한다.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`room:create:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "방을 너무 자주 만들고 있어요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { pw?: unknown; questions?: unknown; timeLimit?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const pw = typeof body.pw === "string" ? body.pw.trim() : "";
  if (!pw || pw.length > 32) {
    return NextResponse.json({ error: "비밀번호를 확인해주세요" }, { status: 400 });
  }

  const nRaw = Number(body.questions);
  const questions = (ROUND_LENGTHS as readonly number[]).includes(nRaw) ? nRaw : DEFAULT_ROUND_LENGTH;
  const timeLimit = Math.min(60, Math.max(5, Number(body.timeLimit) || 10));
  const lang = isLang(typeof body.lang === "string" ? body.lang : null) ? (body.lang as string) : "ko";

  const s = store();
  // 살아있는 방과 코드가 겹치지 않을 때까지 재추첨 (원본과 동일하게 최대 5회)
  let code: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = makeRoomCode();
    if (!(await s.getRoom(candidate))) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 503 });
  }

  const seed = drawRound(questions);
  await s.createRoom({
    code,
    pwHash: await hashPassword(pw),
    state: { phase: "lobby", seed, timeLimit, lang, players: [], createdAt: Date.now() },
  });

  return NextResponse.json({ code, questions, timeLimit, seed });
}
