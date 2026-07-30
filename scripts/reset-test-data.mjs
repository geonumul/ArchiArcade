/**
 * 테스트로 만들어진 행을 걷어낸다. 스모크 테스트를 돌린 뒤 정리용.
 *   node scripts/reset-test-data.mjs
 *
 * 실계정을 지우지 않도록, 계정은 이름이 test/smoke/rank 로 시작하는 것만 지운다.
 * 표·방·코드는 아직 실사용자가 없을 때만 쓰는 것이므로 전부 비운다 —
 * 실서비스 데이터가 쌓인 뒤에는 이 스크립트를 쓰지 말 것.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PREFIX = ["smoke", "rank", "test"];

try {
  const users = await prisma.user.findMany({
    where: { OR: TEST_PREFIX.map((p) => ({ name: { startsWith: p } })) },
    select: { id: true, name: true },
  });
  for (const u of users) {
    await prisma.profile.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }

  const verifs = await prisma.studentVerification.deleteMany({
    where: { OR: TEST_PREFIX.map((p) => ({ email: { startsWith: p } })) },
  });
  const votes = await prisma.vote.deleteMany({});
  const kv = await prisma.kv.deleteMany({});
  await prisma.passwordReset.deleteMany({});
  await prisma.verifyCode.deleteMany({});

  console.log(`지움 → 계정 ${users.length} · 학교인증 ${verifs.count} · 표 ${votes.count} · 저장소 ${kv.count}`);
  console.log(
    `남음 → 계정 ${await prisma.user.count()} · 학교인증 ${await prisma.studentVerification.count()}` +
      ` · 표 ${await prisma.vote.count()} · 저장소 ${await prisma.kv.count()}`
  );
} finally {
  await prisma.$disconnect();
}
