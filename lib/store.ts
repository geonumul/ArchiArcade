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
