/**
 * 공용 키-값 저장소에 무엇이 들어 있는지 본다.
 *   node scripts/inspect-kv.mjs
 *
 * 방 키는 수가 많고 수명이 짧아 개수만 세고, 게시판·집계처럼 사람이 넣은 것은
 * 내용 일부까지 보여 준다. 무엇을 지워도 되는지 판단하려면 이게 먼저 필요하다.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const rows = await prisma.kv.findMany({ orderBy: { key: "asc" } });
  const rooms = rows.filter((r) => r.key.startsWith("abg2-"));
  const rest = rows.filter((r) => !r.key.startsWith("abg2-"));

  console.log(`Kv ${rows.length}행 (방 관련 ${rooms.length}행 · 그 외 ${rest.length}행)\n`);

  for (const r of rest) {
    let summary = `${r.value.length}자`;
    try {
      const v = JSON.parse(r.value);
      if (Array.isArray(v)) {
        summary = `목록 ${v.length}건`;
        // 사람이 쓴 글은 앞 두 건만 보여 준다 — 전체를 쏟아내지 않는다.
        const peek = v.slice(-2).map((x) => (x && x.t ? String(x.t).slice(0, 30) : JSON.stringify(x).slice(0, 30)));
        if (peek.length) summary += ` — 최근: ${peek.join(" / ")}`;
      } else if (v && typeof v === "object") {
        summary = `키 ${Object.keys(v).length}개`;
      }
    } catch {
      /* JSON 이 아니면 길이만 */
    }
    console.log(`  ${r.key}`);
    console.log(`    ${summary}   (수정 ${r.updatedAt.toISOString().slice(0, 16)})`);
  }

  if (rooms.length) {
    const codes = [...new Set(rooms.map((r) => r.key.split("-")[1]))];
    console.log(`\n  방 코드 ${codes.length}개: ${codes.join(", ")}`);
  }
} finally {
  await prisma.$disconnect();
}
