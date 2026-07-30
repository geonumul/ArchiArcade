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

export interface RoomRecord {
  code: string;
  pwHash: string;
  hostId: string | null;
  state: unknown;
  orgId: string | null;
  expiresAt: Date;
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

  createRoom(input: { code: string; pwHash: string; hostId?: string | null; state: unknown; orgId?: string | null }): Promise<RoomRecord>;
  getRoom(code: string): Promise<RoomRecord | null>;
  setRoomState(code: string, state: unknown): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  purgeExpiredRooms(): Promise<number>;

  addVote(input: { questionIdx: number; choice: "a" | "b"; lang: string; roomCode?: string | null }): Promise<void>;
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

  async createRoom(input: { code: string; pwHash: string; hostId?: string | null; state: unknown; orgId?: string | null }) {
    const rec: RoomRecord = {
      code: input.code,
      pwHash: input.pwHash,
      hostId: input.hostId ?? null,
      state: input.state,
      orgId: input.orgId ?? null,
      expiresAt: new Date(Date.now() + ROOM_TTL_MS),
    };
    memoryState().rooms.set(input.code, rec);
    return rec;
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

  async createRoom(input: { code: string; pwHash: string; hostId?: string | null; state: unknown; orgId?: string | null }) {
    const row = await prisma!.room.create({
      data: {
        code: input.code,
        pwHash: input.pwHash,
        hostId: input.hostId ?? null,
        state: input.state as never,
        orgId: input.orgId ?? null,
        expiresAt: new Date(Date.now() + ROOM_TTL_MS),
      },
    });
    return toRoom(row);
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

  async addVote(input: { questionIdx: number; choice: "a" | "b"; lang: string; roomCode?: string | null }) {
    await prisma!.vote.create({
      data: {
        questionIdx: input.questionIdx,
        choice: input.choice,
        lang: input.lang,
        roomCode: input.roomCode ?? null,
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
}): RoomRecord {
  return {
    code: row.code,
    pwHash: row.pwHash,
    hostId: row.hostId,
    state: row.state,
    orgId: row.orgId,
    expiresAt: row.expiresAt,
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
