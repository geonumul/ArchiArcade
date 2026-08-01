/**
 * 저장소 어댑터.
 *
 * 원본 index.html 은 호스팅 환경이 주입해주는 전역 `window.storage` 에 의존했고,
 * 그래서 로컬에서 열면 방 생성·투표·게시판이 전부 실패했다. 여기서는 같은 동작을
 * 두 가지 백엔드로 제공한다.
 *
 *   - DATABASE_URL 이 있으면 Prisma(Postgres)
 *   - 없으면 프로세스 내 메모리 (개발 편의용)
 *
 * 메모리 백엔드는 서버를 재시작하면 사라지고 인스턴스 간에 공유되지 않는다.
 * 절대 프로덕션에서 쓰지 말 것 — 배포 환경에서는 DATABASE_URL 을 반드시 채운다.
 */
import { hasDatabase, prisma } from "@/lib/db";
import { ROOM_TTL_MS } from "@/lib/game/round";
import { ACTIVE_WINDOW_MIN, MAX_CONCURRENT_PLAYERS } from "@/lib/capacity";

export interface RoomRecord {
  code: string;
  pwHash: string;
  hostId: string | null;
  state: unknown;
  orgId: string | null;
  expiresAt: Date;
  playerCount: number;
  maxPlayers: number;
}

/// 입장 시도 결과. 정원이 찼을 때와 방이 없을 때를 호출부가 구분할 수 있어야 한다.
export type JoinResult =
  | { ok: true; playerCount: number; maxPlayers: number }
  | { ok: false; reason: "not_found" | "room_full" | "service_full"; playerCount?: number; maxPlayers?: number };

/**
 * 방 상태의 일부만 고치는 지시.
 *
 * 상태를 통째로 읽어 한 칸 고쳐 다시 쓰면, 같은 순간에 쓴 사람의 기록이 서로를 덮어
 * 사라진다. 30명이 12초 안에 답하는 방에서는 반드시 일어나는 일이고, 사라진 답 하나는
 * 그 사람의 점수가 틀리는 것으로 끝나지 않는다. "다 answered 하면 다음 문항" 이라는
 * 진행 조건이 영원히 성립하지 않게 된다. 그래서 고칠 자리만 한 문장으로 고친다.
 */
export interface RoomStatePatch {
  /// 최상위 키를 덮어쓴다. 진행 상태(q, dl, ph)처럼 방 전체가 공유하는 값이다.
  set?: Record<string, unknown>;
  /// state 아래 이 이름의 map 에 항목을 더한다. 이름은 서버가 정하는 상수여야 한다.
  into?: string;
  /// into 가 가리키는 map 에 더할 항목들.
  add?: Record<string, unknown>;
  /// add 의 키가 이미 있으면 아무것도 하지 않는다. 같은 문항에 두 번 답하는 것을 막는다.
  onlyIfAbsent?: boolean;
  /// 이 값들이 아직 그대로일 때만 고친다. 폴링 두 개가 같은 진행을 두 번 넘기지 못하게 한다.
  expect?: Record<string, unknown>;
}

export interface PostRecord {
  id: number;
  board: string;
  author: string;
  body: string;
  type: string | null;
  lang: string;
  createdAt: Date;
}

export interface VoteTally {
  a: number;
  b: number;
}

export interface Store {
  readonly backend: "prisma" | "memory";

  createRoom(input: {
    code: string;
    pwHash: string;
    hostId?: string | null;
    state: unknown;
    orgId?: string | null;
    maxPlayers: number;
  }): Promise<RoomRecord>;
  getRoom(code: string): Promise<RoomRecord | null>;
  setRoomState(code: string, state: unknown): Promise<void>;
  /// 상태의 일부만 고친다. 조건에 걸려 아무것도 고치지 못했으면 false 를 돌려준다.
  patchRoomState(code: string, patch: RoomStatePatch): Promise<boolean>;
  deleteRoom(code: string): Promise<void>;
  purgeExpiredRooms(): Promise<number>;
  /// 정원 검사와 인원 증가를 한 번에 처리한다. 두 사람이 마지막 한 자리에 동시에
  /// 들어오는 경우를 막으려면 검사와 증가가 나뉘어 있으면 안 된다.
  joinRoom(code: string): Promise<JoinResult>;
  /// 최근 활동 중인 방들의 참가자 합계 — 서비스 전체 안전장치용.
  activePlayers(): Promise<number>;

  addVote(input: {
    questionIdx: number;
    choice: "a" | "b";
    lang: string;
    roomCode?: string | null;
    /// 인증된 학생의 표에만 채워진다 — 학교별 순위와 검증된 응답 집계의 근거.
    schoolDomain?: string | null;
    major?: string | null;
  }): Promise<void>;
  tallyVotes(questionIdx: number): Promise<VoteTally>;

  listPosts(board: string, limit?: number): Promise<PostRecord[]>;
  addPost(input: { board: string; author: string; body: string; type?: string | null; lang: string }): Promise<PostRecord>;

  reactQuestion(questionIdx: number, kind: "hot" | "meh"): Promise<{ hot: number; meh: number }>;
  bumpInterest(feature: string, lang: string): Promise<number>;
}

/**
 * 상태 안의 map 이름 검사.
 *
 * 이 이름만은 파라미터가 아니라 SQL 문장에 그대로 박힌다. jsonb 경로는 값 자리에
 * 넣을 수 없기 때문이다. 그래서 부르는 쪽이 서버가 정한 상수만 넘긴다는 약속에
 * 기대지 않고, 여기서 형태를 좁혀 확인한다. 이 검사가 없으면 저장소 전체가
 * 문자열 조합 SQL 이 된다.
 */
function stateField(name: string): string {
  if (!/^[a-z][a-z0-9]{0,15}$/.test(name)) throw new Error(`상태 필드 이름이 올바르지 않아요: ${name}`);
  return name;
}

// ── 메모리 백엔드 ────────────────────────────────────────────

interface MemoryState {
  rooms: Map<string, RoomRecord>;
  votes: { questionIdx: number; choice: "a" | "b" }[];
  posts: PostRecord[];
  reacts: Map<number, { hot: number; meh: number }>;
  interest: Map<string, number>;
  postSeq: number;
}

const globalForStore = globalThis as unknown as { __arcadeMemory?: MemoryState };

function memoryState(): MemoryState {
  return (globalForStore.__arcadeMemory ??= {
    rooms: new Map(),
    votes: [],
    posts: [],
    reacts: new Map(),
    interest: new Map(),
    postSeq: 1,
  });
}

class MemoryStore implements Store {
  readonly backend = "memory" as const;

  async createRoom(input: {
    code: string;
    pwHash: string;
    hostId?: string | null;
    state: unknown;
    orgId?: string | null;
    maxPlayers: number;
  }) {
    const rec: RoomRecord = {
      code: input.code,
      pwHash: input.pwHash,
      hostId: input.hostId ?? null,
      state: input.state,
      orgId: input.orgId ?? null,
      expiresAt: new Date(Date.now() + ROOM_TTL_MS),
      playerCount: 0,
      maxPlayers: input.maxPlayers,
    };
    memoryState().rooms.set(input.code, rec);
    return rec;
  }

  async joinRoom(code: string): Promise<JoinResult> {
    const rec = await this.getRoom(code);
    if (!rec) return { ok: false, reason: "not_found" };
    if (rec.playerCount >= rec.maxPlayers) {
      return { ok: false, reason: "room_full", playerCount: rec.playerCount, maxPlayers: rec.maxPlayers };
    }
    if ((await this.activePlayers()) >= MAX_CONCURRENT_PLAYERS) {
      return { ok: false, reason: "service_full" };
    }
    rec.playerCount += 1;
    return { ok: true, playerCount: rec.playerCount, maxPlayers: rec.maxPlayers };
  }

  async activePlayers() {
    let n = 0;
    for (const rec of memoryState().rooms.values()) {
      if (rec.expiresAt.getTime() > Date.now()) n += rec.playerCount;
    }
    return n;
  }

  async getRoom(code: string) {
    const rec = memoryState().rooms.get(code) ?? null;
    if (rec && rec.expiresAt.getTime() < Date.now()) {
      memoryState().rooms.delete(code);
      return null;
    }
    return rec;
  }

  async setRoomState(code: string, state: unknown) {
    const rec = memoryState().rooms.get(code);
    if (rec) rec.state = state;
  }

  async patchRoomState(code: string, patch: RoomStatePatch) {
    const rec = memoryState().rooms.get(code);
    if (!rec || rec.expiresAt.getTime() < Date.now()) return false;
    const st: Record<string, unknown> =
      rec.state && typeof rec.state === "object" ? { ...(rec.state as Record<string, unknown>) } : {};

    // 자바스크립트는 한 번에 한 줄만 실행하므로 여기서는 경합이 없다. Postgres 쪽과
    // 같은 결과를 내는 것만 맞추면 된다.
    for (const [k, v] of Object.entries(patch.expect ?? {})) {
      if (JSON.stringify(st[k]) !== JSON.stringify(v)) return false;
    }
    if (patch.into) {
      const field = stateField(patch.into);
      const cur: Record<string, unknown> = { ...((st[field] as Record<string, unknown>) ?? {}) };
      if (patch.onlyIfAbsent) {
        for (const k of Object.keys(patch.add ?? {})) if (cur[k] !== undefined) return false;
      }
      Object.assign(cur, patch.add ?? {});
      st[field] = cur;
    }
    Object.assign(st, patch.set ?? {});
    rec.state = st;
    return true;
  }

  async deleteRoom(code: string) {
    memoryState().rooms.delete(code);
  }

  async purgeExpiredRooms() {
    const s = memoryState();
    let n = 0;
    for (const [code, rec] of s.rooms) {
      if (rec.expiresAt.getTime() < Date.now()) {
        s.rooms.delete(code);
        n++;
      }
    }
    return n;
  }

  async addVote(input: { questionIdx: number; choice: "a" | "b" }) {
    memoryState().votes.push({ questionIdx: input.questionIdx, choice: input.choice });
  }

  async tallyVotes(questionIdx: number) {
    const rows = memoryState().votes.filter((v) => v.questionIdx === questionIdx);
    return {
      a: rows.filter((v) => v.choice === "a").length,
      b: rows.filter((v) => v.choice === "b").length,
    };
  }

  async listPosts(board: string, limit = 50) {
    return memoryState()
      .posts.filter((p) => p.board === board)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .slice(0, limit);
  }

  async addPost(input: { board: string; author: string; body: string; type?: string | null; lang: string }) {
    const s = memoryState();
    const rec: PostRecord = {
      id: s.postSeq++,
      board: input.board,
      author: input.author,
      body: input.body,
      type: input.type ?? null,
      lang: input.lang,
      createdAt: new Date(),
    };
    s.posts.push(rec);
    return rec;
  }

  async reactQuestion(questionIdx: number, kind: "hot" | "meh") {
    const s = memoryState();
    const cur = s.reacts.get(questionIdx) ?? { hot: 0, meh: 0 };
    cur[kind]++;
    s.reacts.set(questionIdx, cur);
    return cur;
  }

  async bumpInterest(feature: string, lang: string) {
    const s = memoryState();
    const key = `${feature}::${lang}`;
    const next = (s.interest.get(key) ?? 0) + 1;
    s.interest.set(key, next);
    return next;
  }
}

// ── Prisma 백엔드 ───────────────────────────────────────────

class PrismaStore implements Store {
  readonly backend = "prisma" as const;

  async createRoom(input: {
    code: string;
    pwHash: string;
    hostId?: string | null;
    state: unknown;
    orgId?: string | null;
    maxPlayers: number;
  }) {
    const row = await prisma!.room.create({
      data: {
        code: input.code,
        pwHash: input.pwHash,
        hostId: input.hostId ?? null,
        state: input.state as never,
        orgId: input.orgId ?? null,
        maxPlayers: input.maxPlayers,
        expiresAt: new Date(Date.now() + ROOM_TTL_MS),
      },
    });
    return toRoom(row);
  }

  async joinRoom(code: string): Promise<JoinResult> {
    // 서비스 전체 안전장치가 먼저다. 방에 자리가 남아 있어도 동시에 열린 방이 많으면
    // 무료 티어 한도를 넘기므로 여기서 막는다.
    if ((await this.activePlayers()) >= MAX_CONCURRENT_PLAYERS) {
      return { ok: false, reason: "service_full" };
    }

    // 검사와 증가를 한 문장으로 처리한다. 나누면 마지막 한 자리를 두 사람이
    // 동시에 통과해 정원을 넘길 수 있다.
    const rows = await prisma!.$queryRaw<{ playerCount: number; maxPlayers: number }[]>`
      UPDATE "Room"
         SET "playerCount" = "playerCount" + 1,
             "updatedAt"   = NOW()
       WHERE "code" = ${code}
         AND "expiresAt" > NOW()
         AND "playerCount" < "maxPlayers"
      RETURNING "playerCount", "maxPlayers"
    `;

    if (rows.length > 0) {
      return { ok: true, playerCount: rows[0].playerCount, maxPlayers: rows[0].maxPlayers };
    }

    // 갱신되지 않았다면 방이 없거나 정원이 찬 것이므로, 어느 쪽인지 확인해 알려준다.
    const room = await prisma!.room.findUnique({
      where: { code },
      select: { playerCount: true, maxPlayers: true, expiresAt: true },
    });
    if (!room || room.expiresAt.getTime() < Date.now()) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "room_full", playerCount: room.playerCount, maxPlayers: room.maxPlayers };
  }

  async activePlayers() {
    const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60 * 1000);
    const agg = await prisma!.room.aggregate({
      _sum: { playerCount: true },
      where: { updatedAt: { gte: since }, expiresAt: { gt: new Date() } },
    });
    return agg._sum.playerCount ?? 0;
  }

  async getRoom(code: string) {
    const row = await prisma!.room.findUnique({ where: { code } });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await prisma!.room.delete({ where: { code } }).catch(() => undefined);
      return null;
    }
    return toRoom(row);
  }

  async setRoomState(code: string, state: unknown) {
    await prisma!.room.update({ where: { code }, data: { state: state as never } });
  }

  async patchRoomState(code: string, patch: RoomStatePatch) {
    const field = patch.into ? stateField(patch.into) : null;

    /* jsonb 의 || 는 두 오브젝트의 키를 합친다. 한 문장 안에서 일어나는 일이라 같은
       순간에 들어온 다른 답을 지우지 않는다 - 서로 다른 키를 더하기 때문이다. */
    const target = field
      ? `jsonb_set("state", '{${field}}', COALESCE("state"->'${field}', '{}'::jsonb) || $2::jsonb, true)`
      : `"state"`;

    const params: unknown[] = [
      code,
      JSON.stringify(patch.add ?? {}),
      JSON.stringify(patch.set ?? {}),
      JSON.stringify(patch.expect ?? {}),
    ];
    const conds: string[] = [];
    if (field && patch.onlyIfAbsent) {
      for (const key of Object.keys(patch.add ?? {})) {
        params.push(key);
        conds.push(`AND "state" -> '${field}' -> $${params.length}::text IS NULL`);
      }
    }

    const n = await prisma!.$executeRawUnsafe(
      `UPDATE "Room"
          SET "state" = ${target} || $3::jsonb,
              "updatedAt" = NOW()
        WHERE "code" = $1
          AND "expiresAt" > NOW()
          AND "state" @> $4::jsonb
          ${conds.join("\n          ")}`,
      ...params
    );
    return n > 0;
  }

  async deleteRoom(code: string) {
    await prisma!.room.delete({ where: { code } }).catch(() => undefined);
  }

  async purgeExpiredRooms() {
    const res = await prisma!.room.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return res.count;
  }

  async addVote(input: {
    questionIdx: number;
    choice: "a" | "b";
    lang: string;
    roomCode?: string | null;
    schoolDomain?: string | null;
    major?: string | null;
  }) {
    await prisma!.vote.create({
      data: {
        questionIdx: input.questionIdx,
        choice: input.choice,
        lang: input.lang,
        roomCode: input.roomCode ?? null,
        schoolDomain: input.schoolDomain ?? null,
        major: input.major ?? null,
      },
    });
  }

  async tallyVotes(questionIdx: number) {
    const rows = await prisma!.vote.groupBy({
      by: ["choice"],
      where: { questionIdx },
      _count: { _all: true },
    });
    const get = (c: string) => rows.find((r) => r.choice === c)?._count._all ?? 0;
    return { a: get("a"), b: get("b") };
  }

  async listPosts(board: string, limit = 50) {
    return prisma!.post.findMany({ where: { board }, orderBy: { createdAt: "desc" }, take: limit });
  }

  async addPost(input: { board: string; author: string; body: string; type?: string | null; lang: string }) {
    return prisma!.post.create({
      data: {
        board: input.board,
        author: input.author,
        body: input.body,
        type: input.type ?? null,
        lang: input.lang,
      },
    });
  }

  async reactQuestion(questionIdx: number, kind: "hot" | "meh") {
    const row = await prisma!.questionReact.upsert({
      where: { questionIdx },
      create: { questionIdx, hot: kind === "hot" ? 1 : 0, meh: kind === "meh" ? 1 : 0 },
      update: { [kind]: { increment: 1 } },
    });
    return { hot: row.hot, meh: row.meh };
  }

  async bumpInterest(feature: string, lang: string) {
    const row = await prisma!.featureInterest.upsert({
      where: { feature_lang: { feature, lang } },
      create: { feature, lang, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count;
  }
}

function toRoom(row: {
  code: string;
  pwHash: string;
  hostId: string | null;
  state: unknown;
  orgId: string | null;
  expiresAt: Date;
  playerCount: number;
  maxPlayers: number;
}): RoomRecord {
  return {
    code: row.code,
    pwHash: row.pwHash,
    hostId: row.hostId,
    state: row.state,
    orgId: row.orgId,
    expiresAt: row.expiresAt,
    playerCount: row.playerCount,
    maxPlayers: row.maxPlayers,
  };
}

let cached: Store | null = null;

export function store(): Store {
  if (!cached) {
    cached = hasDatabase && prisma ? new PrismaStore() : new MemoryStore();
    if (cached.backend === "memory" && process.env.NODE_ENV === "production") {
      console.warn(
        "[store] DATABASE_URL 없이 프로덕션으로 기동됨 — 인메모리 백엔드는 데이터가 보존되지 않습니다."
      );
    }
  }
  return cached;
}
