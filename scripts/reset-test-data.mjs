/**
 * 스모크 테스트가 남긴 행만 걷어낸다.
 *   node scripts/reset-test-data.mjs           → 지울 것만 보여 준다
 *   node scripts/reset-test-data.mjs --yes     → 실제로 지운다
 *
 * 예전 판은 Kv 와 Vote 를 조건 없이 전부 비웠다. 그 두 곳에는 실제 사용자가 넣은
 * 제보·관심 등록·전역 투표 집계가 함께 들어 있어서, 테스트를 정리한다면서 남의 글을
 * 지울 수 있는 스크립트였다. 지금은 테스트가 만드는 것만 골라 지우고, 사람이 넣은
 * 키는 손대지 않는다. 기본은 미리보기이고 --yes 를 줘야 실행된다.
 */
import { PrismaClient } from "@prisma/client";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");

/// 테스트 계정·인증은 이 접두사로만 만든다(스모크 스크립트가 그렇게 짓는다).
const TEST_PREFIX = ["smoke", "rank", "alum", "test"];

/**
 * 사람이 넣은 것이 섞여 있어 지우면 안 되는 키.
 *   arcade-qfeedback-v1 · arcade-ideas-v1  게시판 글
 *   arcade-interest-v1                     커뮤니티 관심 등록
 *   archbal-bank-v4                        154문항 전역 투표 집계
 *   arcade-stats-v1                        COIN / PLAYS 누적
 */
const KEEP_KV = /^(arcade-(qfeedback|ideas|interest|stats)-v\d+|archbal-bank-v\d+)$/;

try {
  const users = await prisma.user.findMany({
    where: { OR: TEST_PREFIX.map((p) => ({ name: { startsWith: p } })) },
    select: { id: true, name: true },
  });

  const verifs = await prisma.studentVerification.findMany({
    where: { OR: TEST_PREFIX.map((p) => ({ email: { startsWith: p } })) },
    select: { id: true, email: true },
  });

  // 방 키만 지운다. 수명이 24시간이라 남아도 무해하지만 테스트가 많이 만든다.
  const kv = await prisma.kv.findMany({ select: { key: true } });
  const kvDrop = kv.filter((r) => r.key.startsWith("abg2-") && !KEEP_KV.test(r.key));
  const kvKeep = kv.filter((r) => !kvDrop.some((d) => d.key === r.key));

  console.log(`계정 ${users.length}건: ${users.map((u) => u.name).join(", ") || "없음"}`);
  console.log(`학교인증 ${verifs.length}건`);
  console.log(`방 키 ${kvDrop.length}건`);
  console.log(`\n건드리지 않는 키 ${kvKeep.length}건:`);
  kvKeep.forEach((r) => console.log(`  ${r.key}`));

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 지우려면 --yes 를 붙이세요.");
    console.log("표(Vote)와 위 키는 사람이 넣은 것이 섞여 이 스크립트가 지우지 않습니다.");
    exit(0);
  }

  for (const u of users) {
    await prisma.profile.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.studentVerification.deleteMany({ where: { id: { in: verifs.map((v) => v.id) } } });
  await prisma.kv.deleteMany({ where: { key: { in: kvDrop.map((r) => r.key) } } });
  await prisma.passwordReset.deleteMany({ where: { OR: TEST_PREFIX.map((p) => ({ email: { startsWith: p } })) } });
  await prisma.verifyCode.deleteMany({ where: { OR: TEST_PREFIX.map((p) => ({ email: { startsWith: p } })) } });

  console.log(`\n지웠습니다 → 계정 ${users.length} · 학교인증 ${verifs.length} · 방 키 ${kvDrop.length}`);
  console.log(`남음 → 계정 ${await prisma.user.count()} · 학교인증 ${await prisma.studentVerification.count()}` +
    ` · 표 ${await prisma.vote.count()} · 저장소 ${await prisma.kv.count()}`);
} finally {
  await prisma.$disconnect();
}
