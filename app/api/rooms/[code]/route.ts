import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/// 방 상태 조회. 비밀번호 해시는 절대 내보내지 않는다.
export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const room = await store().getRoom(code);
  if (!room) return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
  return NextResponse.json({ code: room.code, state: room.state, expiresAt: room.expiresAt });
}

/// 입장 — 비밀번호 검증. 무차별 대입을 막기 위해 방 코드 단위로 제한한다.
export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const rl = await rateLimit(`room:join:${code}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "입장 시도가 너무 많아요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { pw?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const room = await store().getRoom(code);
  if (!room) return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });

  const pw = typeof body.pw === "string" ? body.pw : "";
  const { ok } = await verifyPassword(pw, room.pwHash);
  if (!ok) return NextResponse.json({ error: "비밀번호가 달라요" }, { status: 403 });

  return NextResponse.json({ code: room.code, state: room.state });
}

/// 호스트의 상태 갱신(진행 단계·공개 등).
export async function PATCH(req: Request, { params }: Ctx) {
  const { code } = await params;
  let body: { state?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const room = await store().getRoom(code);
  if (!room) return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });

  await store().setRoomState(code, body.state ?? {});
  return NextResponse.json({ ok: true });
}

/// 호스트가 방을 종료.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { code } = await params;
  await store().deleteRoom(code);
  return NextResponse.json({ ok: true });
}
