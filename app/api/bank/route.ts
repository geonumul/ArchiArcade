import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 154문항 전역 투표 합산.
 *
 * 이 숫자는 "다른 학교 사람들은 뭘 골랐나"를 보여 주는 근거라, 서비스에서 가장
 * 중요한 데이터다(CLAUDE.md 6). 원본은 저장소에서 집계 전체를 읽어 한 칸을 고쳐
 * 통째로 다시 쓰는 방식이었는데, 그러면 동시에 답한 사람들의 표가 서로를 덮어
 * 사라진다. 혼자 놀 때는 드러나지 않지만, 30명이 한 방에서 동시에 누르는 순간
 * 대부분의 표가 유실된다.
 *
 * 그래서 증가만 서버에서 한 문장으로 처리한다. 읽기는 원본이 하던 대로
 * /api/kv?key=archbal-bank-v4 를 쓰므로 저장 위치와 형식은 그대로다.
 *
 *   POST /api/bank  { bi, a, b }  →  { a, b }   (해당 문항의 갱신된 합계)
 *     · 솔로  : 고른 쪽에 1
 *     · 라이브: 방에서 모인 A/B 표를 한 번에
 */

const KEY = "archbal-bank-v4";
/// 문항 은행 크기. 9개 언어가 1:1 로 정렬된 154문항이라 그 밖의 인덱스는 받지 않는다.
const BANK_SIZE = 154;
/// 한 번에 더할 수 있는 표의 상한. 방 정원(최대 100)보다 넉넉하게 둔다.
const MAX_DELTA = 500;

function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) {
    return NextResponse.json({ error: "DATABASE_URL 설정 후 사용할 수 있어요" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 한 판이 30문항이라, 연달아 두 판을 해도 걸리지 않을 만큼만 열어 둔다.
  const rl = await rateLimit(`bank:${ipKey(ip)}`, 120, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { bi?: unknown; a?: unknown; b?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const bi = intIn(body.bi, 0, BANK_SIZE - 1);
  const a = intIn(body.a ?? 0, 0, MAX_DELTA);
  const b = intIn(body.b ?? 0, 0, MAX_DELTA);
  if (bi === null || a === null || b === null) {
    return NextResponse.json({ error: "bad range" }, { status: 400 });
  }
  if (a === 0 && b === 0) {
    return NextResponse.json({ error: "nothing to add" }, { status: 400 });
  }

  const path = String(bi);

  // 한 문장 안에서 읽고 더하고 쓴다. bi/a/b 는 위에서 정수 범위로 걸렀고 전부
  // 파라미터로 넘어가므로 SQL 을 문자열로 이어 붙이는 자리가 없다.
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "Kv" ("key", "value", "updatedAt", "createdAt")
    VALUES (
      ${KEY},
      ${JSON.stringify({ [path]: { a, b } })},
      now(), now()
    )
    ON CONFLICT ("key") DO UPDATE SET
      "value" = jsonb_set(
        COALESCE(NULLIF("Kv"."value", '')::jsonb, '{}'::jsonb),
        ARRAY[${path}],
        jsonb_build_object(
          'a', COALESCE((COALESCE(NULLIF("Kv"."value", '')::jsonb, '{}'::jsonb) -> ${path} ->> 'a')::bigint, 0) + ${a}::bigint,
          'b', COALESCE((COALESCE(NULLIF("Kv"."value", '')::jsonb, '{}'::jsonb) -> ${path} ->> 'b')::bigint, 0) + ${b}::bigint
        ),
        true
      )::text,
      "updatedAt" = now()
    RETURNING "value"
  `;

  // 갱신된 그 문항의 합계만 돌려준다 — 화면은 그 숫자만 쓴다.
  let entry = { a, b };
  try {
    const all = JSON.parse(rows[0]?.value ?? "{}") as Record<string, { a?: number; b?: number }>;
    const e = all[path];
    if (e) entry = { a: Number(e.a) || 0, b: Number(e.b) || 0 };
  } catch {
    /* 파싱 실패 시엔 이번에 더한 값만 돌려준다 — 화면이 멈추지 않는 편이 낫다 */
  }

  return NextResponse.json(entry);
}
