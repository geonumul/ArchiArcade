import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import {
  MAX_LIST_KEYS,
  MAX_VALUE_BYTES,
  expiryFor,
  isAllowedKey,
  isAllowedPrefix,
  isWritableKey,
} from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 원본 index.html 의 `window.storage` 백엔드.
 *
 *   GET    /api/kv?key=…      → { value }        (없으면 404)
 *   GET    /api/kv?prefix=…   → { keys: [...] }
 *   POST   /api/kv            → { ok: true }     body { key, value }
 *   DELETE /api/kv?key=…      → { ok: true }
 */

// ── DB 없는 로컬 개발용 폴백 ──────────────────────────────────
interface MemRow {
  value: string;
  expiresAt: number | null;
}
const globalForKv = globalThis as unknown as { __arcadeKv?: Map<string, MemRow> };
const mem = (globalForKv.__arcadeKv ??= new Map<string, MemRow>());

// ── 읽기 레이트리밋 ───────────────────────────────────────────
// 방은 2초마다 폴링하므로 읽기가 압도적으로 많다. 그 경로까지 Upstash 를 태우면
// 한 판에 수백 커맨드가 나가 무료 한도를 금방 태우므로, 읽기는 프로세스 메모리로만
// 막는다. 인스턴스 간 공유가 안 되는 대신 비용이 0이고, 읽기는 파괴적이지 않다.
const READ_LIMIT = 900;
const READ_WINDOW_MS = 60_000;
const globalForRead = globalThis as unknown as {
  __arcadeKvRead?: Map<string, { n: number; resetAt: number }>;
};
const reads = (globalForRead.__arcadeKvRead ??= new Map());

function allowRead(ip: string): boolean {
  const now = Date.now();
  const b = reads.get(ip);
  if (!b || b.resetAt <= now) {
    reads.set(ip, { n: 1, resetAt: now + READ_WINDOW_MS });
    // 창이 갱신되는 김에 죽은 항목을 걷는다 — 별도 타이머 없이 맵이 커지는 것만 막으면 된다.
    if (reads.size > 5000) for (const [k, v] of reads) if (v.resetAt <= now) reads.delete(k);
    return true;
  }
  b.n++;
  return b.n <= READ_LIMIT;
}

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

const tooMany = (retryAfterSec: number) =>
  NextResponse.json(
    { error: "too many requests" },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } }
  );

export async function GET(req: Request) {
  const ip = ipOf(req);
  if (!allowRead(ip)) return tooMany(30);

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const prefix = url.searchParams.get("prefix");
  const now = Date.now();

  if (prefix !== null) {
    if (!isAllowedPrefix(prefix)) {
      return NextResponse.json({ error: "prefix not allowed" }, { status: 400 });
    }
    if (!hasDatabase || !prisma) {
      const keys: string[] = [];
      for (const [k, row] of mem) {
        if (k.startsWith(prefix) && (row.expiresAt === null || row.expiresAt > now)) keys.push(k);
        if (keys.length >= MAX_LIST_KEYS) break;
      }
      return NextResponse.json({ keys });
    }
    const rows = await prisma.kv.findMany({
      where: {
        key: { startsWith: prefix },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
      select: { key: true },
      take: MAX_LIST_KEYS,
    });
    return NextResponse.json({ keys: rows.map((r) => r.key) });
  }

  if (!key || !isAllowedKey(key)) {
    return NextResponse.json({ error: "key not allowed" }, { status: 400 });
  }

  if (!hasDatabase || !prisma) {
    const row = mem.get(key);
    if (!row || (row.expiresAt !== null && row.expiresAt <= now)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ key, value: row.value });
  }

  const row = await prisma.kv.findUnique({ where: { key } });
  if (!row || (row.expiresAt && row.expiresAt.getTime() <= now)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ key, value: row.value });
}

export async function POST(req: Request) {
  const ip = ipOf(req);
  const rl = await rateLimit(`kv:w:${ipKey(ip)}`, 240, 60);
  if (!rl.allowed) return tooMany(rl.retryAfterSec);

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  const value = typeof body.value === "string" ? body.value : "";
  // 쓰기는 더 좁다. 대기실 채팅처럼 읽기만 열어 둔 키가 있다.
  if (!isWritableKey(key)) {
    return NextResponse.json({ error: "key not allowed" }, { status: 400 });
  }
  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    return NextResponse.json({ error: "value too large" }, { status: 413 });
  }

  const now = Date.now();
  const expiresAt = expiryFor(key, now);

  if (!hasDatabase || !prisma) {
    mem.set(key, { value, expiresAt: expiresAt ? expiresAt.getTime() : null });
    return NextResponse.json({ ok: true });
  }

  await prisma.kv.upsert({
    where: { key },
    create: { key, value, expiresAt },
    update: { value, expiresAt },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ip = ipOf(req);
  const rl = await rateLimit(`kv:w:${ipKey(ip)}`, 240, 60);
  if (!rl.allowed) return tooMany(rl.retryAfterSec);

  const key = new URL(req.url).searchParams.get("key");
  if (!key || !isWritableKey(key)) {
    return NextResponse.json({ error: "key not allowed" }, { status: 400 });
  }

  if (!hasDatabase || !prisma) {
    mem.delete(key);
    return NextResponse.json({ ok: true });
  }

  // 이미 없는 키를 지우는 것은 오류가 아니다 — 원본은 투표를 바꿀 때마다 부른다.
  await prisma.kv.deleteMany({ where: { key } });
  return NextResponse.json({ ok: true });
}
