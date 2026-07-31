/**
 * 공용 저장소에 남아 있는 옛 신청 글을 Report 표로 옮긴다.
 *   node scripts/import-legacy-ideas.mjs         → 무엇이 옮겨지는지만 보여 준다
 *   node scripts/import-legacy-ideas.mjs --yes   → 실제로 옮긴다
 *
 * 게시판은 공용 저장소(arcade-ideas-v1)에서 서버(Report)로 옮겨갔는데, 그때 옛 글을
 * 함께 옮기지 않았다. 그래서 저장소에는 글이 있는데 화면에는 아무것도 안 뜬다.
 * 내가 지웠던 글을 저장소 쪽에 되살려 놓고도 화면이 그대로였던 것이 이 때문이다.
 *
 * 옛 글에는 계정이 없다. 그때는 로그인 없이 아무 이름으로 쓸 수 있었기 때문이다.
 * 없는 계정을 지어 붙이면 그 사람이 쓴 것처럼 보이므로 작성자 자리는 비워 둔다.
 *
 * 같은 글을 두 번 넣지 않도록 (작성시각, 본문) 으로 이미 있는지 본다.
 */
import { PrismaClient } from "@prisma/client";
import { argv, exit } from "node:process";

const prisma = new PrismaClient();
const apply = argv.includes("--yes");
const KEY = "arcade-ideas-v1";
/// 옛 글에는 종류가 없다. 신청 게시판이므로 "새질문" 으로 둔다.
const KIND = "새질문";

try {
  const row = await prisma.kv.findUnique({ where: { key: KEY } });
  if (!row) {
    console.log("옛 글이 없습니다.");
    exit(0);
  }

  let old = [];
  try {
    const v = JSON.parse(row.value);
    old = Array.isArray(v) ? v : [];
  } catch {
    console.log("옛 값을 읽지 못했습니다.");
    exit(1);
  }

  const already = await prisma.report.findMany({
    where: { board: "idea" },
    select: { body: true, createdAt: true },
  });
  const have = new Set(already.map((r) => `${r.createdAt.getTime()}|${r.body}`));

  const rows = old
    .filter((p) => p && p.t && Number.isFinite(Number(p.ts)))
    .map((p) => ({
      board: "idea",
      userId: null,
      authorName: String(p.n || "익명").slice(0, 20),
      kind: KIND,
      body: String(p.t).slice(0, 500),
      lang: "ko",
      createdAt: new Date(Number(p.ts)),
    }))
    .filter((r) => !have.has(`${r.createdAt.getTime()}|${r.body}`));

  console.log(`저장소 ${old.length}건 · 표에 이미 ${already.length}건 → 옮길 글 ${rows.length}건`);
  rows.forEach((r) => console.log(`   · ${r.authorName}: ${r.body.slice(0, 40)}`));

  if (!rows.length) exit(0);
  if (!apply) {
    console.log("\n미리보기입니다. 실제로 옮기려면 --yes 를 붙이세요.");
    exit(0);
  }

  await prisma.report.createMany({ data: rows });
  const total = await prisma.report.count({ where: { board: "idea" } });
  console.log(`\n${rows.length}건 옮겼습니다. 신청 게시판 ${total}건.`);
} finally {
  await prisma.$disconnect();
}
