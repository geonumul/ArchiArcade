import { PrismaClient } from "@prisma/client";

/// DATABASE_URL 이 없으면 DB 없이 동작한다(개발용 인메모리 폴백 — lib/store.ts 참고).
export const hasDatabase = Boolean(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/// 개발 중 HMR 이 재실행돼도 커넥션이 누적되지 않도록 전역에 하나만 둔다.
export const prisma: PrismaClient | null = hasDatabase
  ? (globalForPrisma.prisma ??= new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }))
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

/// 라우트에서 DB 가 반드시 필요한 경우에 쓴다.
export function db(): PrismaClient {
  if (!prisma) {
    throw new Error("DATABASE_URL 이 설정되지 않았습니다 — .env 를 확인하세요.");
  }
  return prisma;
}
