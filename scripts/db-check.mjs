/**
 * DB 연결·스키마·인코딩 점검. 배포 전이나 연결 문자열을 바꾼 뒤 돌린다.
 *   node scripts/db-check.mjs
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// .env 를 직접 읽는다(next 없이 단독 실행하기 위해).
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // .env 가 없으면 환경변수만 쓴다
}

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL 이 없습니다.");
  process.exit(1);
}

const prisma = new PrismaClient();

const tables = await prisma.$queryRawUnsafe(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
);
const names = tables.map((t) => t.table_name).filter((n) => n !== "_prisma_migrations");
console.log(`테이블 ${names.length}개: ${names.join(", ")}`);

const [users, votes, rooms, posts] = await Promise.all([
  prisma.user.count(),
  prisma.vote.count(),
  prisma.room.count(),
  prisma.post.count(),
]);
console.log(`행 수 — user=${users} vote=${votes} room=${rooms} post=${posts}`);

// 한글·CJK 가 깨지지 않고 저장되는지 왕복 확인
const sample = await prisma.user.findMany({ select: { name: true }, take: 5 });
for (const u of sample) {
  const cps = [...u.name].map((c) => c.codePointAt(0).toString(16)).join(" ");
  console.log(`  name="${u.name}" 길이=${[...u.name].length} U+[${cps}]`);
}

await prisma.$disconnect();
