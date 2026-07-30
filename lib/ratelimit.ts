/**
 * 레이트리밋 — Upstash Redis 가 설정돼 있으면 그쪽을, 아니면 프로세스 메모리를 쓴다.
 *
 * Upstash 는 REST API 로만 호출하므로 별도 SDK 의존성이 없다.
 * 메모리 폴백은 인스턴스 간 공유가 안 되므로 서버리스 프로덕션에서는 사실상 무력하다
 * — 배포 전에 UPSTASH_REDIS_REST_URL / TOKEN 을 반드시 채울 것.
 */
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasUpstash = Boolean(URL_ && TOKEN);

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRl = globalThis as unknown as { __arcadeRl?: Map<string, Bucket> };
const buckets = (globalForRl.__arcadeRl ??= new Map<string, Bucket>());

async function upstash(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(URL_ as string, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * 고정 창(fixed window) 카운터. 로그인 5회 실패 시 60초 잠금 같은 용도.
 * @param key    식별자 (예: `login:${name}`)
 * @param limit  창 안에서 허용할 횟수
 * @param windowSec 창 길이(초)
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  if (hasUpstash) {
    try {
      // 무료 한도가 월 50만 "커맨드" 기준이라 호출 수를 아낀다.
      //   창의 첫 요청  : INCR + EXPIRE (2)
      //   통과하는 요청 : INCR only     (1)
      //   차단된 요청   : INCR + TTL    (2, 재시도 안내에 남은 시간이 필요할 때만)
      const count = Number(await upstash(["INCR", key]));

      if (count === 1) {
        await upstash(["EXPIRE", key, windowSec]);
        return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
      }
      if (count <= limit) {
        return { allowed: true, remaining: limit - count, retryAfterSec: 0 };
      }

      const ttl = Number(await upstash(["TTL", key]));
      // TTL 이 -1(만료 없음)이면 EXPIRE 가 유실된 것이므로 다시 걸어 영구 잠금을 막는다.
      if (ttl < 0) {
        await upstash(["EXPIRE", key, windowSec]);
        return { allowed: false, remaining: 0, retryAfterSec: windowSec };
      }
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, ttl) };
    } catch {
      // Upstash 장애 시 서비스를 막지 않는다 — 메모리로 폴백
    }
  }

  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  b.count++;
  const allowed = b.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: allowed ? 0 : Math.ceil((b.resetAt - now) / 1000),
  };
}

/// 성공 시 카운터를 비운다(로그인 성공 등).
export async function resetLimit(key: string): Promise<void> {
  if (hasUpstash) {
    try {
      await upstash(["DEL", key]);
      return;
    } catch {
      /* 폴백으로 진행 */
    }
  }
  buckets.delete(key);
}
