/**
 * 이미 인증된 사람들의 학교 이름을 새 규칙에 맞춘다.
 *   node scripts/backfill-school-names.mjs          → 바뀔 것만 보여 준다
 *   node scripts/backfill-school-names.mjs --yes    → 실제로 고친다
 *
 * 학교 이름을 영문(schoolName)과 현지어(schoolLocal) 둘로 나누기 전에 인증한 사람은
 * 한 칸에 아무 이름이나 들어가 있다. 예를 들어 가톨릭대는 "가톨릭대학교" 가
 * schoolName 에 있어서, 화면이 영문 자리에 한글을 크게 띄운다.
 *
 * 도메인으로 현재 목록을 다시 찾아 두 칸을 채운다. 목록에 없는 도메인은 그대로 둔다.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");

/**
 * 목록을 직접 읽는다.
 *
 * lib/school.ts 를 그대로 부르고 싶지만 그쪽은 `@/data` 별칭을 쓰고, 그 별칭은
 * Next 빌드에서만 풀린다. 여기서 필요한 것은 도메인 하나로 이름 두 개를 찾는 일뿐이라
 * 목록만 읽어 같은 규칙(정확히 일치 → 상위 도메인)으로 찾는다.
 */
const SCHOOLS = JSON.parse(readFileSync("data/schools.json", "utf8"));

function lookup(domain) {
  const hit = SCHOOLS.domains[domain];
  if (hit) return hit;
  for (const [d, meta] of Object.entries(SCHOOLS.domains)) {
    if (domain.endsWith("." + d)) return meta;
  }
  return null;
}

try {
  const rows = await prisma.studentVerification.findMany({
    select: { id: true, email: true, schoolDomain: true, schoolName: true, schoolLocal: true },
  });

  const changes = [];
  for (const r of rows) {
    const found = lookup(r.schoolDomain);
    if (!found) continue;
    if (found.name === r.schoolName && (found.local ?? null) === r.schoolLocal) continue;
    changes.push({ id: r.id, domain: r.schoolDomain, from: r.schoolName, name: found.name, local: found.local ?? null });
  }

  if (!changes.length) {
    console.log(`인증 ${rows.length}건 - 고칠 것 없음`);
    exit(0);
  }

  console.log(`인증 ${rows.length}건 중 ${changes.length}건이 바뀝니다:\n`);
  for (const c of changes) {
    console.log(`  ${c.domain}`);
    console.log(`    이전: ${c.from}`);
    console.log(`    이후: ${c.name}${c.local ? `  [작게: ${c.local}]` : ""}`);
  }

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 고치려면 --yes 를 붙이세요.");
    exit(0);
  }

  for (const c of changes) {
    await prisma.studentVerification.update({
      where: { id: c.id },
      data: { schoolName: c.name, schoolLocal: c.local },
    });
  }
  console.log(`\n${changes.length}건 고쳤습니다.`);
} finally {
  await prisma.$disconnect();
}
