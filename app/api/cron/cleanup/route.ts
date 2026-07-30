import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 만료된 방 정리. Vercel Cron 이 하루 한 번 호출한다(vercel.json).
 *
 * 하루 한 번인 이유는 Hobby 플랜이 그 이상을 허용하지 않기 때문이다. 그래도 문제가
 * 없는 이유는 방을 조회할 때마다 만료를 검사해 그 자리에서 지우기 때문이고, 그래서
 * 이 작업이 실제로 치우는 건 아무도 열어보지 않은 채 남은 행뿐이다. Pro 로 올리면
 * 스케줄만 시간 단위로 되돌리면 된다.
 *
 * CRON_SECRET 이 설정돼 있으면 헤더로 검증해 외부 호출을 막는다.
 */
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
