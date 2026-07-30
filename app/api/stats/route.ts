import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 허브의 COIN / PLAYS 카운터.
 *
 * 원본은 저장소에서 값을 읽어 1을 더해 다시 쓰는 식으로 올렸는데, 그러면 두 요청이
 * 겹칠 때 한쪽 증가분이 사라진다(읽고-고쳐-쓰기 경쟁). 첫 방문의 visits 쓰기가
 * 도착하기 전에 plays 를 읽어 버리면 plays 가 0으로 되돌아가는 것이 실제로 재현됐다.
 *
 * 그래서 증가를 서버에서 한 문장으로 처리한다. jsonb 산술을 쓰는 UPSERT 한 번이라
 * 동시에 몇 명이 들어와도 증가분이 겹쳐 사라지지 않는다. 저장 위치는 원본과 같은
 * Kv 행(arcade-stats-v1)이므로 그 키를 직접 읽는 경로도 그대로 동작한다.
 */

const KEY = "arcade-stats-v1";
/// 늘릴 수 있는 칸은 이 둘뿐이다. 임의 필드를 받으면 JSON 이 끝없이 커진다.
const FIELDS = new Set(["visits", "plays"]);

interface Stats {
  visits: number;
  plays: number;
}

const ZERO: Stats = { visits: 0, plays: 0 };

function parse(value: string | null | undefined): Stats {
  if (!value) return ZERO;
  try {
    const o = JSON.parse(value) as Record<string, unknown>;
    return { visits: Number(o.visits) || 0, plays: Number(o.plays) || 0 };
  } catch {
    return ZERO;
  }
}

async function current(): Promise<Stats> {
  if (!prisma) return ZERO;
  const row = await prisma.kv.findUnique({ where: { key: KEY } }).catch(() => null);
  return parse(row?.value);
}

export async function GET() {
  if (!hasDatabase || !prisma) return NextResponse.json(ZERO);
  return NextResponse.json(await current());
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) return NextResponse.json(ZERO);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await rateLimit(`stats:${ip}`, 60, 60);
  // 막혔더라도 화면에 숫자는 떠야 하므로 현재 값을 돌려준다.
  if (!rl.allowed) return NextResponse.json(await current());

  let field: string | null = null;
  try {
    const body = (await req.json()) as { field?: unknown };
    if (typeof body.field === "string" && FIELDS.has(body.field)) field = body.field;
  } catch {
    /* 본문이 없으면 읽기만 한다 — 원본의 bumpStats(null) 과 같은 동작 */
  }
  if (!field) return NextResponse.json(await current());

  // 한 문장 안에서 읽고 더하고 쓴다. field 는 위에서 허용목록으로 걸렀고 값도
  // 파라미터로 넘기므로 문자열을 이어 붙이는 자리가 없다.
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "Kv" ("key", "value", "updatedAt", "createdAt")
    VALUES (${KEY}, ${JSON.stringify({ ...ZERO, [field]: 1 })}, now(), now())
    ON CONFLICT ("key") DO UPDATE SET
      "value" = jsonb_set(
        COALESCE(NULLIF("Kv"."value", '')::jsonb, '{}'::jsonb),
        ARRAY[${field}],
        to_jsonb(
          COALESCE((NULLIF("Kv"."value", '')::jsonb ->> ${field})::bigint, 0) + 1
        )
      )::text,
      "updatedAt" = now()
    RETURNING "value"
  `;

  return NextResponse.json(parse(rows[0]?.value));
}
