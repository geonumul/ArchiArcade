/**
 * 설계자 맞히기 문제 은행을 합친다.
 *   node scripts/merge-archq-bank.mjs <조각.json> [조각.json ...]         → 무엇이 늘어나는지만 보여 준다
 *   node scripts/merge-archq-bank.mjs --yes <조각.json> [조각.json ...]   → 실제로 쓴다
 *
 * 조각 파일 모양:
 *   { "architects": [{la,ko,ja,zh,tw}, ...],
 *     "buildings":  [{arch: "<설계자의 la>", y, c, la, ko, ja, zh, tw}, ...] }
 *
 * 조각에서 설계자를 번호가 아니라 이름으로 가리키게 한 이유가 있다. 번호로 받으면
 * 여러 조각을 합칠 때 번호가 서로 어긋나 엉뚱한 사람이 정답이 된다. 이름으로 받아
 * 합치는 쪽에서 번호를 다시 매기면 그런 일이 생기지 않는다.
 *
 * 중복은 la(로마자 이름)로 본다. 사람도 건물도 그 이름이 유일하다고 보고,
 * 이미 있는 것은 조용히 건너뛴다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

const BANK = "public/quiz-architect.js";
const apply = argv.includes("--yes");
const files = argv.slice(2).filter((a) => a !== "--yes");

if (!files.length) {
  console.log("합칠 조각 파일을 알려주세요.");
  console.log("  node scripts/merge-archq-bank.mjs 조각1.json 조각2.json");
  exit(1);
}

/// 원본은 window.ARCHQ 에 대입하는 스크립트다. 그대로 실행해서 값을 꺼낸다.
function loadBank() {
  const g = {};
  // eslint-disable-next-line no-new-func
  new Function("window", readFileSync(BANK, "utf8"))(g);
  return g.ARCHQ;
}

const bank = loadBank();
const archByName = new Map(bank.arch.map((a, i) => [a.la, i]));
const bldNames = new Set(bank.bld.map((b) => b.la));

const before = { arch: bank.arch.length, bld: bank.bld.length };
let skippedArch = 0;
let skippedBld = 0;
let unresolved = 0;

for (const file of files) {
  const piece = JSON.parse(readFileSync(file, "utf8"));

  for (const a of piece.architects ?? []) {
    if (archByName.has(a.la)) {
      skippedArch++;
      continue;
    }
    archByName.set(a.la, bank.arch.length);
    bank.arch.push({ la: a.la, ko: a.ko, ja: a.ja, zh: a.zh, tw: a.tw });
  }

  for (const b of piece.buildings ?? []) {
    const ai = archByName.get(b.arch);
    if (ai === undefined) {
      // 가리키는 설계자가 없으면 정답이 없는 문제가 된다. 넣지 않는다.
      console.log(`  설계자를 못 찾음: ${b.arch} (${b.la})`);
      unresolved++;
      continue;
    }
    if (bldNames.has(b.la)) {
      skippedBld++;
      continue;
    }
    bldNames.add(b.la);
    bank.bld.push({ a: ai, y: b.y, c: b.c, la: b.la, ko: b.ko, ja: b.ja, zh: b.zh, tw: b.tw });
  }
  console.log(`${file}: 설계자 ${piece.architects?.length ?? 0} · 건물 ${piece.buildings?.length ?? 0}`);
}

/* 보기 넷을 채우려면 한 사람에게 건물이 여럿 있어야 오답으로 쓸 만하다. 하나뿐인
   사람은 그 사람 문제에서만 쓰이고 오답으로는 거의 안 나와서, 있으나 마나 하다. */
const count = {};
bank.bld.forEach((b) => (count[b.a] = (count[b.a] ?? 0) + 1));
const thin = bank.arch.map((a, i) => ({ la: a.la, n: count[i] ?? 0 })).filter((x) => x.n === 0);

console.log(`\n설계자 ${before.arch} → ${bank.arch.length} · 건물 ${before.bld} → ${bank.bld.length}`);
console.log(`  이미 있어 건너뜀: 설계자 ${skippedArch} · 건물 ${skippedBld}`);
if (unresolved) console.log(`  설계자를 못 찾아 버린 건물: ${unresolved}`);
if (thin.length) console.log(`  건물이 하나도 없는 설계자 ${thin.length}명: ${thin.map((x) => x.la).join(", ")}`);

const byCountry = {};
bank.bld.forEach((b) => (byCountry[b.c] = (byCountry[b.c] ?? 0) + 1));
console.log(
  "\n" +
    Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join("  ")
);

if (!apply) {
  console.log("\n미리보기입니다. 실제로 쓰려면 --yes 를 붙이세요.");
  exit(0);
}

const head = `/**
 * "이 건물 누가 설계했게" 문제 은행.
 *
 * bld 의 a 는 arch 의 자리 번호다. 사람 이름을 매번 적지 않으려고 번호로 가리킨다.
 *
 * la 는 로마자 이름이고 영어·프랑스어·이탈리아어·독일어·스페인어가 함께 쓴다.
 * Le Corbusier 를 프랑스어로 옮겨 봐야 못 알아보기 때문이다. 한중일만 각자의 표기를
 * 따로 갖는다. zh 는 간체, tw 는 번체라 글자가 실제로 다른 곳은 다르게 적었다.
 *
 * 연도나 설계자가 확실하지 않은 건물은 넣지 않고 뺐다. 공동 설계라 정답이 둘이 되는
 * 것도 마찬가지다 - 틀린 것을 가르치는 퀴즈는 짧은 퀴즈보다 나쁘다.
 *
 * 이 파일은 scripts/merge-archq-bank.mjs 가 만든다. 손으로 고치지 말 것.
 */
window.ARCHQ = {
  arch: [
`;

const archLines = bank.arch
  .map((a) => `    ${JSON.stringify(a)},`)
  .join("\n");

/// 나라별로 묶어 두면 사람이 훑어보며 이상한 줄을 찾기 쉽다.
const groups = {};
bank.bld.forEach((b, i) => (groups[b.c] = groups[b.c] ?? []).push(i));
const bldLines = Object.entries(groups)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([c, idxs]) => {
    const rows = idxs
      .sort((x, y) => bank.bld[x].y - bank.bld[y].y)
      .map((i) => `    ${JSON.stringify(bank.bld[i])},`)
      .join("\n");
    return `    /* ${c} ${idxs.length}개 */\n${rows}`;
  })
  .join("\n");

writeFileSync(BANK, `${head}${archLines}\n  ],\n  bld: [\n${bldLines}\n  ]\n};\n`, "utf8");
console.log("\n은행을 다시 썼습니다.");
