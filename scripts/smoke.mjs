/**
 * 로컬 스모크 테스트. 서버를 띄운 뒤 실행한다.
 *   npx next start -p 3100
 *   node scripts/smoke.mjs http://127.0.0.1:3100
 *
 * docs/DEV_HANDOFF.md 의 "배포 전 스모크" 중 API 로 확인 가능한 항목을 자동화한 것.
 */
const BASE = process.argv[2] || "http://127.0.0.1:3100";

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  OK    ${label}${extra ? "  " + extra : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`);
  }
};

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 본문 없는 응답 */
  }
  return { status: res.status, body: json };
}

console.log(`대상: ${BASE}\n`);

console.log("[1] /api/health");
{
  const r = await call("/api/health");
  ok(r.status === 200, "응답 200");
  ok(r.body?.banks?.total === 1386, "문항 9x154=1386", `실제 ${r.body?.banks?.total}`);
  ok((r.body?.banks?.problems ?? []).length === 0, "은행 정합성 문제 없음");
  console.log(`        storage=${r.body?.storage?.backend} rateLimit=${r.body?.rateLimit}`);
}

console.log("\n[2] 방 정원 — 10명 방에 11명 입장 시도");
let code;
{
  const created = await call("/api/rooms", "POST", {
    pw: "1234",
    questions: 10,
    timeLimit: 15,
    lang: "ko",
    maxPlayers: 10,
  });
  ok(created.status === 200, "방 생성", `code=${created.body?.code}`);
  ok(created.body?.maxPlayers === 10, "정원 10 반영");
  code = created.body?.code;

  let admitted = 0;
  let fullMsg = null;
  for (let i = 1; i <= 11; i++) {
    const j = await call(`/api/rooms/${code}`, "POST", { pw: "1234" });
    if (j.status === 200) admitted++;
    else if (j.status === 409) fullMsg = j.body;
  }
  ok(admitted === 10, "정확히 10명만 입장", `입장 ${admitted}명`);
  ok(fullMsg?.full === "room", "11번째는 정원 초과로 거절");
  console.log(`        안내문: "${fullMsg?.error}"`);
}

console.log("\n[3] 정원이 차도 비밀번호 검증이 먼저");
{
  const j = await call(`/api/rooms/${code}`, "POST", { pw: "wrong" });
  ok(j.status === 403, "틀린 비밀번호는 403", `실제 ${j.status}`);
}

console.log("\n[4] 방 조회에 인원 노출 / 비밀번호 해시 비노출");
{
  const g = await call(`/api/rooms/${code}`);
  ok(g.body?.playerCount === 10 && g.body?.maxPlayers === 10, "인원 10/10");
  ok(!("pwHash" in (g.body ?? {})), "pwHash 미노출");
}

console.log("\n[5] 투표 집계");
{
  const v = await call("/api/votes", "POST", { idx: 0, choice: "a", lang: "ko", roomCode: code });
  ok(v.status === 200 && typeof v.body?.a === "number", "투표 기록", `a=${v.body?.a} b=${v.body?.b}`);
}

console.log("\n[6] 룰베이스 검열");
{
  const cases = [
    ["이 문항 진짜 노잼이다", true],
    ["제 번호 010-1234-5678", false],
    ["논문대필 해드립니다", false],
  ];
  for (const [text, expected] of cases) {
    const m = await call("/api/moderate", "POST", { text, lang: "ko" });
    const got = m.status === 200 && m.body?.ok === true;
    ok(got === expected, `"${text.slice(0, 18)}" → ${expected ? "통과" : "차단"}`, m.body?.reason ?? "");
  }
}

console.log("\n[7] 방 종료");
{
  await call(`/api/rooms/${code}`, "DELETE");
  const g = await call(`/api/rooms/${code}`);
  ok(g.status === 404, "종료 후 조회 404");
}

console.log(`\n${fail === 0 ? "=== 전체 통과 ===" : `=== 실패 ${fail}건 / 통과 ${pass}건 ===`}`);
process.exit(fail === 0 ? 0 : 1);
