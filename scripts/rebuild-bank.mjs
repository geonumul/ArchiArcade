/**
 * 전역 문항 집계(archbal-bank-v4)를 Vote 표에서 다시 만든다.
 *   node scripts/rebuild-bank.mjs         → 무엇이 달라지는지만 보여 준다
 *   node scripts/rebuild-bank.mjs --yes   → 실제로 쓴다
 *
 * 화면에 뜨는 "전세계 A 62%" 는 공용 저장소의 키 하나에 들어 있다. 그 키는 덮어쓰기
 * 방식이라 한 번 지우면 이전 값이 남지 않는데, 검증하는 과정에서 내가 그 키를 비웠다.
 *
 * 다행히 개인 투표는 Vote 표에 한 줄씩 남아 있어 거기서 되살릴 수 있다. 다만 방에서
 * 나온 표는 호스트가 집계해 그 키에만 더하던 시절이 있어, 그만큼은 Vote 에 없다.
 * 그래서 이 스크립트는 "Vote 로 설명되는 만큼" 을 복구하며, 지금 남아 있는 값보다
 * 작아지는 문항은 건드리지 않는다 - 되살리려다 더 깎는 일은 없어야 한다.
 */
import { PrismaClient } from "@prisma/client";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");
const KEY = "archbal-bank-v4";

try {
  const rows = await prisma.vote.groupBy({
    by: ["questionIdx", "choice"],
    _count: { _all: true },
  });

  /** { [questionIdx]: { a, b } } - 원본 화면이 쓰는 모양 그대로 */
  const fromVotes = {};
  for (const r of rows) {
    const e = (fromVotes[r.questionIdx] ??= { a: 0, b: 0 });
    if (r.choice === "a") e.a += r._count._all;
    else if (r.choice === "b") e.b += r._count._all;
  }

  const cur = await prisma.kv.findUnique({ where: { key: KEY } });
  let now = {};
  try {
    now = cur ? JSON.parse(cur.value) : {};
  } catch {
    /* 망가진 값이면 빈 것으로 본다 */
  }

  const merged = { ...now };
  let restored = 0;
  let kept = 0;
  for (const [idx, e] of Object.entries(fromVotes)) {
    const have = now[idx] ?? { a: 0, b: 0 };
    // 큰 쪽을 남긴다. 지금 값이 더 크면 방 집계가 섞인 것이므로 그대로 둔다.
    const next = { a: Math.max(have.a ?? 0, e.a), b: Math.max(have.b ?? 0, e.b) };
    if (next.a !== (have.a ?? 0) || next.b !== (have.b ?? 0)) restored++;
    else kept++;
    merged[idx] = next;
  }

  const before = Object.keys(now).length;
  const after = Object.keys(merged).length;
  const sum = (o) => Object.values(o).reduce((n, e) => n + (e.a || 0) + (e.b || 0), 0);

  console.log(`Vote 표: ${rows.reduce((n, r) => n + r._count._all, 0)}표 · ${Object.keys(fromVotes).length}문항`);
  console.log(`집계 키: 지금 ${before}문항 ${sum(now)}표 → 복구 후 ${after}문항 ${sum(merged)}표`);
  console.log(`  되살아나는 문항 ${restored}개 · 그대로 두는 문항 ${kept}개`);

  if (!apply) {
    console.log("\n미리보기입니다. 실제로 쓰려면 --yes 를 붙이세요.");
    exit(0);
  }

  await prisma.kv.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  console.log("\n집계 키를 다시 썼습니다.");
} finally {
  await prisma.$disconnect();
}
