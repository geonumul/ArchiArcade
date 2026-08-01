import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyPassword } from "@/lib/auth";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isArchqState } from "@/lib/game/archq-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * 설계자 맞히기 방은 이 문을 쓰지 못하게 막는다.
 *
 * 두 게임이 같은 Room 표를 나눠 쓰기 때문에, 코드만 알면 이 주소로 그 방을 열어볼 수
 * 있다. 그런데 여기 GET 은 state 를 통째로 돌려주고, 그 안에는 아직 내지 않은 문제와
 * 보기 순서가 전부 들어 있다. 한 번 열어 보면 그 방의 점수는 뜻이 없어진다.
 * PATCH 는 더한데, 상태를 통째로 덮어쓰므로 남의 판을 아무 값으로나 바꿀 수 있다.
 *
 * 그래서 이쪽 문은 닫고 /api/rooms/archq/[code] 로 보낸다. 거기서는 지금 문항 하나만
 * 나가고, 진행을 바꾸는 것은 호스트만 할 수 있다.
 */
function archqDoor() {
  return NextResponse.json(
    { error: "이 방은 설계자 맞히기 방이에요", game: "archq", use: "/api/rooms/archq" },
    { status: 409 }
  );
}

/// 방 상태 조회. 비밀번호 해시는 절대 내보내지 않는다.
export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const room = await store().getRoom(code);
  if (!room) return NextResponse.json({ error: "없거나 만료된 방이에요" }, { status: 404 });
  if (isArchqState(room.state)) return archqDoor();
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
  const perIp = await rateLimit(`room:join:ip:${ipKey(ip)}`, 30, 60);
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
  if (isArchqState(room.state)) return archqDoor();

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
  if (isArchqState(room.state)) return archqDoor();

  await store().setRoomState(code, body.state ?? {});
  return NextResponse.json({ ok: true });
}

/// 호스트가 방을 종료.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const room = await store().getRoom(code);
  if (room && isArchqState(room.state)) return archqDoor();
  await store().deleteRoom(code);
  return NextResponse.json({ ok: true });
}
