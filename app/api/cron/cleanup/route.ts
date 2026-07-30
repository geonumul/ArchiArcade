import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// 만료된 방 정리. Vercel Cron 이 매시 호출한다(vercel.json 참고).
/// CRON_SECRET 이 설정돼 있으면 헤더로 검증해 외부 호출을 막는다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const removed = await store().purgeExpiredRooms();
  return NextResponse.json({ ok: true, removed });
}
