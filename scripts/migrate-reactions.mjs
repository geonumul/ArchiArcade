/**
 * 옛 리액션(공용 저장소의 arcade-qreact-v1)을 QuestionReact 표로 옮긴다.
 *   node scripts/migrate-reactions.mjs         → 무엇이 옮겨지는지만 보여 준다
 *   node scripts/migrate-reactions.mjs --yes   → 실제로 옮긴다
 *
 * 예전에는 문항별 숫자만 저장소에 쌓았다. 누가 눌렀는지는 남지 않아 한 사람이 몇
 * 번이고 누를 수 있었지만, 이미 쌓인 숫자에는 사람들이 실제로 남긴 반응이 들어 있다.
 * 새 표로 옮겨 두면 노잼이 많은 문항이 밸런스 조절 후보로 바로 올라온다.
 *
 * 지금 값보다 작아지지 않게 큰 쪽을 남긴다 - 옮기려다 깎는 일은 없어야 한다.
 */
import { PrismaClient } from "@prisma/client";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");
const KEY = "arcade-qreact-v1";
/// 서버와 같은 기준. 노잼이 이만큼이면 후보로 올린다.
const FLAG_AT = 5;

try {
  const row = await prisma.kv.findUnique({ where: { key: KEY } });
  if (!row) {
    console.log("옛 리액션이 없습니다.");
    exit(0);
  }

  let old = {};
  try {
    old = JSON.parse(row.value) ?? {};
  } catch {
    console.log("옛 리액션 값을 읽지 못했습니다.");
    exit(1);
  }

  const entries = Object.entries(old)
    .map(([idx, e]) => ({ idx: Number(idx), hot: e?.h ?? 0, meh: e?.m ?? 0 }))
    .filter((e) => Number.isInteger(e.idx) && (e.hot > 0 || e.meh > 0));

  const willFlag = entries.filter((e) => e.meh >= FLAG_AT);
  console.log(`옮길 문항 ${entries.length}개 · 그중 후보로 올라갈 문항 ${willFlag.length}개`);
  willFlag.slice(0, 10).forEach((e) => console.log(`  문항 ${e.idx}  노잼 ${e.meh} · 꿀잼 ${e.hot}`));

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 옮기려면 --yes 를 붙이세요.");
    exit(0);
  }

  for (const e of entries) {
    const cur = await prisma.questionReact.findUnique({ where: { questionIdx: e.idx } });
    const hot = Math.max(cur?.hot ?? 0, e.hot);
    const meh = Math.max(cur?.meh ?? 0, e.meh);
    await prisma.questionReact.upsert({
      where: { questionIdx: e.idx },
      create: {
        questionIdx: e.idx,
        hot,
        meh,
        flaggedAt: meh >= FLAG_AT ? new Date() : null,
      },
      update: {
        hot,
        meh,
        // 이미 손본 문항은 다시 후보로 올리지 않는다.
        ...(meh >= FLAG_AT && !cur?.flaggedAt && !cur?.resolvedAt ? { flaggedAt: new Date() } : {}),
      },
    });
  }

  const flagged = await prisma.questionReact.count({
    where: { flaggedAt: { not: null }, resolvedAt: null },
  });
  console.log(`\n${entries.length}문항 옮겼습니다. 밸런스 조절 후보 ${flagged}개.`);
} finally {
  await prisma.$disconnect();
}
