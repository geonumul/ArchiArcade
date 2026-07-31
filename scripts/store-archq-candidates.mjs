/**
 * 조사해 온 문제 후보를 DB 보관함에 넣는다.
 *   node scripts/store-archq-candidates.mjs <조각.json> [...]         → 무엇이 들어가는지만 보여 준다
 *   node scripts/store-archq-candidates.mjs --yes <조각.json> [...]   → 실제로 넣는다
 *
 * 화면이 쓰는 은행(public/quiz-architect.js)은 건드리지 않는다. 지금 있는 문항만으로도
 * 어렵다는 이야기가 있어서, 자료는 모아 두되 내보내는 것은 따로 정하기로 했다.
 *
 * 여러 번 돌려도 같은 결과가 되게 한다. 건물 이름으로 이미 있는지 보고, 있으면 건너뛴다.
 * 화면 은행에 이미 있는 건물도 넣지 않는다 - 후보는 "아직 안 나간 것" 이어야 뜻이 있다.
 *
 * batch 는 파일 이름에서 딴다. 나중에 특정 조사만 빼거나 다시 확인할 때 쓴다.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");
const files = argv.slice(2).filter((a) => a !== "--yes");

if (!files.length) {
  console.log("넣을 조각 파일을 알려주세요.");
  console.log("  node scripts/store-archq-candidates.mjs 조각1.json 조각2.json");
  exit(1);
}

/// 화면 은행은 window.ARCHQ 에 대입하는 스크립트다. 그대로 실행해 값을 꺼낸다.
function liveBank() {
  const g = {};
  new Function("window", readFileSync("public/quiz-architect.js", "utf8"))(g);
  return g.ARCHQ;
}

try {
  const live = liveBank();
  const shipped = new Set(live.bld.map((b) => b.la));
  const already = new Set((await prisma.archqCandidate.findMany({ select: { la: true } })).map((r) => r.la));

  let queued = 0;
  let dupLive = 0;
  let dupHave = 0;
  let noArch = 0;
  const rows = [];
  const seen = new Set();

  for (const file of files) {
    const batch = basename(file).replace(/\.json$/, "");
    const piece = JSON.parse(readFileSync(file, "utf8"));

    /* 조각 안의 설계자와, 화면 은행에 이미 있는 설계자를 함께 본다. 조각이 기존
       설계자를 다시 선언하지 않고 이름으로만 가리키기 때문이다. */
    const byName = new Map((piece.architects ?? []).map((a) => [a.la, a]));
    live.arch.forEach((a) => { if (!byName.has(a.la)) byName.set(a.la, a); });

    let n = 0;
    for (const b of piece.buildings ?? []) {
      const a = byName.get(b.arch);
      if (!a) { noArch++; continue; }
      if (shipped.has(b.la)) { dupLive++; continue; }
      if (already.has(b.la) || seen.has(b.la)) { dupHave++; continue; }
      seen.add(b.la);
      rows.push({
        archLa: a.la, archKo: a.ko, archJa: a.ja, archZh: a.zh, archTw: a.tw,
        la: b.la, ko: b.ko, ja: b.ja, zh: b.zh, tw: b.tw,
        y: b.y, c: b.c, batch,
      });
      n++;
    }
    queued += n;
    console.log(`${batch}: 넣을 문항 ${n}개`);
  }

  console.log(`\n보관함에 새로 들어갈 문항 ${queued}개`);
  if (dupLive) console.log(`  화면 은행에 이미 있어 제외: ${dupLive}`);
  if (dupHave) console.log(`  보관함에 이미 있어 제외: ${dupHave}`);
  if (noArch) console.log(`  설계자를 못 찾아 제외: ${noArch}`);

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 넣으려면 --yes 를 붙이세요.");
    exit(0);
  }

  // 한 번에 다 넣으면 한 줄이 틀렸을 때 전부 되돌아간다. 나눠서 넣는다.
  for (let i = 0; i < rows.length; i += 200) {
    await prisma.archqCandidate.createMany({ data: rows.slice(i, i + 200), skipDuplicates: true });
  }
  const total = await prisma.archqCandidate.count();
  console.log(`\n${rows.length}개 넣었습니다. 보관함 전체 ${total}개.`);
} finally {
  await prisma.$disconnect();
}
