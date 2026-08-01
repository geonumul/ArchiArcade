/**
 * 검증하면서 내가 만든 흔적을 지운다.
 *   node scripts/clear-test-noise.mjs         → 무엇이 지워지는지만 보여 준다
 *   node scripts/clear-test-noise.mjs --yes   → 실제로 지운다
 *
 * 집계는 무엇을 만들지 정하는 근거인데, 자동 검사가 만든 숫자가 섞여 있으면 그 근거가
 * 흔들린다. 사람이 한 판과 스크립트가 돈 판은 구분이 안 되므로, 확실히 내 것만 고른다.
 *
 * 무엇이 내 것인가:
 *   - 나라가 ZZ 인 판 기록. 로컬은 배포 경계를 지나지 않아 나라 헤더가 없다.
 *   - 접속기록 중 IP 가 루프백인 것. 로컬에서 부른 것뿐이다.
 *   - 엔드포인트를 확인하려고 넣은 instagram 방문 한 건.
 *   - 방문 0에 플레이만 있는 영어 데스크톱 줄. 페이지 검사가 매번 한 판을 돌린 흔적이다.
 *
 * 지우지 않는 것:
 *   - 남의 개인정보를 실제로 열어 본 접속기록. 내 테스트였더라도 그 열람은 일어났고,
 *     그걸 지우는 것은 접속기록을 두는 이유 자체를 없애는 일이다(고시 제8조).
 *   - 실제 사용자가 만든 값. 관심도의 es 는 스페인어로 보던 사람이 누른 것이다.
 */
import { PrismaClient } from "@prisma/client";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");

/// 남의 정보를 실제로 건드린 일. 이런 줄은 내 것이라도 남긴다.
const TOUCHED_PEOPLE = ["동문목록 조회", "동문 명단 조회", "제보 삭제", "순위 기록 삭제"];

try {
  const rounds = await prisma.roundStat.findMany({ where: { country: "ZZ" } });
  const roundsN = rounds.reduce((n, r) => n + r.started, 0);

  const logs = await prisma.adminAccessLog.findMany({
    where: { ip: { contains: "127.0.0.1" } },
    select: { id: true, action: true, subject: true },
  });
  const logNoise = logs.filter((l) => !TOUCHED_PEOPLE.includes(l.action));
  const logKeep = logs.filter((l) => TOUCHED_PEOPLE.includes(l.action));

  /* 페이지 검사는 한글로 열렸다가 영어로 바뀐 뒤 한 판을 돈다. 그래서 방문은 한국어
     줄에 섞여 버리고 플레이만 영어 줄에 남는다. 방문 0에 플레이만 있는 영어 데스크톱
     줄이 그것이다 - 사람이 그렇게 되려면 언어를 바꾸고 바로 플레이해야 하는데,
     열다섯 판이 전부 그런 경우일 수는 없다. */
  const visitsAuto = await prisma.visitStat.findMany({
    where: { visits: 0, lang: "en", device: "desktop", channel: "direct" },
  });
  const instagram = await prisma.visitStat.findMany({
    where: { channel: "instagram", device: "mobile", lang: "ko", visits: 1, plays: 0, signups: 0 },
  });

  console.log(`판 기록(ZZ)          ${rounds.length}줄 · ${roundsN}판`);
  console.log(`접속기록(루프백)      ${logs.length}줄 중 ${logNoise.length}줄 삭제 · ${logKeep.length}줄 유지`);
  logKeep.forEach((l) => console.log(`   유지: ${l.action} | ${l.subject.slice(0, 46)}`));
  console.log(`검사가 만든 플레이     ${visitsAuto.length}줄 · ${visitsAuto.reduce((n, v) => n + v.plays, 0)}판`);
  console.log(`내가 넣은 instagram   ${instagram.length}줄`);

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 지우려면 --yes 를 붙이세요.");
    exit(0);
  }

  await prisma.roundStat.deleteMany({ where: { country: "ZZ" } });
  if (logNoise.length) {
    await prisma.adminAccessLog.deleteMany({ where: { id: { in: logNoise.map((l) => l.id) } } });
  }
  for (const v of [...visitsAuto, ...instagram]) {
    await prisma.visitStat.delete({
      where: { day_channel_device_lang: { day: v.day, channel: v.channel, device: v.device, lang: v.lang } },
    });
  }
  console.log("\n지웠습니다.");
} finally {
  await prisma.$disconnect();
}
