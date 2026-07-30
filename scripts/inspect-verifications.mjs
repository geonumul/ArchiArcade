/**
 * 학교 인증 기록 점검.
 *   node scripts/inspect-verifications.mjs            → 목록만 보기
 *   node scripts/inspect-verifications.mjs --purge=<id> → 그 기록 하나 지우기
 *
 * 이메일은 항상 가려서 출력한다 — 화면 공유나 로그에 원문이 남지 않게 한다.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const purge = process.argv.find((a) => a.startsWith("--purge="))?.slice("--purge=".length);

const mask = (e) => e.replace(/^(.{2}).*(@.*)$/, "$1***$2");

try {
  if (purge) {
    const row = await prisma.studentVerification.findUnique({ where: { id: purge } });
    if (!row) {
      console.log("그런 기록이 없습니다: " + purge);
    } else {
      await prisma.studentVerification.delete({ where: { id: purge } });
      await prisma.verifyCode.deleteMany({ where: { email: row.email } });
      console.log(`지웠습니다: ${row.schoolName} / ${mask(row.email)}`);
    }
    console.log("");
  }

  const rows = await prisma.studentVerification.findMany({
    orderBy: { verifiedAt: "asc" },
  });

  console.log(`StudentVerification ${rows.length}행`);
  for (const r of rows) {
    console.log(
      `  ${r.schoolName} (${r.schoolDomain})  ${mask(r.email)}  ${r.major}` +
        `  ${r.verifiedAt.toISOString().slice(0, 16)}  공개:${r.directoryOptIn}  id=${r.id}`
    );
  }

  const votes = await prisma.vote.count();
  const stamped = await prisma.vote.count({ where: { schoolDomain: { not: null } } });
  console.log("");
  console.log(`Vote ${votes}행 (학교 찍힌 표 ${stamped}행)`);
  console.log(`User ${await prisma.user.count()}행 · VerifyCode ${await prisma.verifyCode.count()}행`);
} finally {
  await prisma.$disconnect();
}
