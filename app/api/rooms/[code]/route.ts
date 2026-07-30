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
  return NextResponse.json({
    code: room.code,
    state: room.state,
    expiresAt: room.expiresAt,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
  });
}

/// 입장 — 비밀번호 검증. 무차별 대입을 막기 위해 방 코드 단위로 제한한다.
export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;

  // 요청 전체가 아니라 "출처별 시도"와 "실패"를 따로 센다.
  // 방 단위로 모든 시도를 세면 정원 50인 방이 정원을 채우지 못한다 —
  // 정상 입장 50건이 곧바로 한도를 넘겨버리기 때문이다.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const perIp = await rateLimit(`room:join:ip:${ip}`, 30, 60);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "입장 시도가 너무 많아요" },
      { status: 429, headers: { "retry-after": String(perIp.retryAfterSec) } }
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
  if (!ok) {
    // 방 비밀번호는 네 자리라 무차별 대입이 현실적인 위협이다. 실패만 세어
    // 정상 입장에는 영향을 주지 않으면서 추측 속도를 제한한다.
    const fails = await rateLimit(`room:join:fail:${code}`, 10, 60);
    if (!fails.allowed) {
      return NextResponse.json(
        { error: "비밀번호 시도가 너무 많아요" },
        { status: 429, headers: { "retry-after": String(fails.retryAfterSec) } }
      );
    }
    return NextResponse.json({ error: "비밀번호가 달라요" }, { status: 403 });
  }

  // 비밀번호가 맞은 뒤에 정원을 본다. 순서가 반대면 비밀번호를 모르는 사람도
  // 정원이 찼는지 여부로 방의 상태를 떠볼 수 있다.
  const join = await store().joinRoom(code);
  if (!join.ok) {
    if (join.reason === "not_found") {
      return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
    }
    if (join.reason === "service_full") {
      return NextResponse.json(
        { error: "지금 접속자가 많아요. 잠시 후 다시 시도해주세요", full: "service" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: `정원이 찼어요 (${join.playerCount ?? 0}/${join.maxPlayers ?? 0})`,
        full: "room",
        playerCount: join.playerCount,
        maxPlayers: join.maxPlayers,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    code: room.code,
    state: room.state,
    playerCount: join.playerCount,
    maxPlayers: join.maxPlayers,
  });
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
