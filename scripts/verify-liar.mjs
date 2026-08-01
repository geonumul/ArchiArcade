/**
 * 라이어게임 한 판을 네 사람으로 실제로 돌려 본다.
 *   npx next start -p 3100
 *   node scripts/verify-liar.mjs http://127.0.0.1:3100
 *
 * 비밀번호를 쓰지 않는다. 서버가 발급하는 것과 같은 형식의 토큰을 직접 만들어 쿠키로
 * 넣는다 - 남의 계정 비밀번호 없이도 경로 전체를 확인할 수 있다.
 *
 * 여기서 보는 것은 규칙이 지켜지는가다. 화면이 예쁜지가 아니라, 라이어가 밖으로 새지
 * 않는지·남의 제시어가 보이지 않는지·못 들어와야 할 때 못 들어오는지를 본다.
 */
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const BASE = process.argv[2] || "http://127.0.0.1:3100";
const NEED = 4;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "OK  " : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
};

const prisma = new PrismaClient();
const users = await prisma.user.findMany({ take: NEED, orderBy: { createdAt: "asc" } });
await prisma.$disconnect();
if (users.length < NEED) {
  console.log(`계정이 ${NEED}개 필요합니다 (지금 ${users.length}개).`);
  process.exit(1);
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const ck = await Promise.all(
  users.map(async (u) =>
    "aa_at=" +
    (await new SignJWT({ sub: u.id, name: u.name, gen: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret))
  )
);

async function call(i, path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { cookie: ck[i], ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: res.status, d: await res.json().catch(() => ({})) };
}

console.log(`대상: ${BASE}\n`);

console.log("[1] 방 만들기와 입장");
const made = await call(0, "/api/rooms/liar", "POST", {
  pw: "1234", need: NEED, talk: 120, lang: "ko", name: users[0].name,
});
ok(made.s === 200 && made.d.code, "방 생성", JSON.stringify(made.d));
const code = made.d.code;

for (let i = 1; i < NEED; i++) {
  const j = await call(i, `/api/rooms/liar/${code}`, "POST", { pw: "1234", name: users[i].name });
  ok(j.s === 200, `${i + 1}번째 입장`, j.s === 200 ? "" : JSON.stringify(j.d));
}
const bad = await call(1, `/api/rooms/liar/${code}`, "POST", { pw: "틀림", name: "x" });
ok(bad.s === 200, "이미 들어온 사람은 비밀번호를 다시 안 묻는다", `상태 ${bad.s}`);

const lobby = await call(0, `/api/rooms/liar/${code}`);
ok(lobby.d.ph === "lobby" && lobby.d.players === NEED, "대기실에 넷", `ph=${lobby.d.ph} players=${lobby.d.players}`);
ok(lobby.d.host === true, "만든 사람이 방장");

console.log("\n[2] 시작과 제시어");
const started = await call(0, `/api/rooms/liar/${code}`, "PATCH", { action: "start" });
ok(started.s === 200 && started.d.ph === "reveal", "시작됨", `ph=${started.d.ph}`);

const views = [];
for (let i = 0; i < NEED; i++) views.push((await call(i, `/api/rooms/liar/${code}`)).d);

const liars = views.filter((v) => v.imLiar);
ok(liars.length === 1, "라이어는 정확히 한 명", `${liars.length}명`);
const liarIdx = views.findIndex((v) => v.imLiar);

// 남의 정체가 새지 않는가
const leaked = views.some((v) => JSON.stringify(v).includes('"liar":"'));
ok(!leaked, "누가 라이어인지 밖으로 안 나간다");

/* 라이어와 나머지가 다른 글자를 받아야 한다. 예전에는 번호만 내려보내고 화면이 골랐는데,
   그러면 라이어가 그 번호로 진짜 단어를 읽어 맞히기를 무조건 성공시킬 수 있었다. */
const crew = [...new Set(views.filter((v) => !v.imLiar).map((v) => v.word.w))];
ok(crew.length === 1, "라이어 아닌 사람들은 같은 단어를 본다", crew.join(", "));
ok(views[liarIdx].word.w !== crew[0], "라이어는 다른 단어를 본다",
  views[liarIdx].word.w + " vs " + crew[0]);
ok(!JSON.stringify(views[liarIdx]).includes(crew[0]), "라이어에게 진짜 단어가 새지 않는다");
ok(views.every((v) => v.word && v.word.d), "설명이 함께 내려온다",
  views.map((v) => v.word.w).join(" / "));
ok(views.every((v) => v.myWord === undefined), "제시어 번호는 안 내려간다");
ok(views.every((v) => v.until > Date.now()), "제시어가 사라지는 시각이 내려온다");

console.log("\n[3] 시작한 뒤에는 못 들어온다");
const late = await fetch(`${BASE}/api/rooms/liar/${code}`, {
  method: "POST",
  headers: { cookie: ck[0].replace(/aa_at=.*/, "aa_at=broken"), "content-type": "application/json" },
  body: JSON.stringify({ pw: "1234", name: "늦은사람" }),
});
ok(late.status === 401 || late.status === 409, "로그인 안 됐거나 이미 시작한 방은 거절", `상태 ${late.status}`);

console.log("\n[4] 단계 넘김은 서버가 한다");
await new Promise((r) => setTimeout(r, 10_500));
const afterReveal = (await call(0, `/api/rooms/liar/${code}`)).d;
ok(afterReveal.ph === "talk", "10초 뒤 이야기 단계로 넘어감", `ph=${afterReveal.ph}`);

console.log("\n[5] 지목");
// 이야기 시간을 기다리지 않으려고, 넷이 모두 지목할 수 있는 단계까지 상태를 확인만 한다
const beforeVote = (await call(0, `/api/rooms/liar/${code}`)).d;
ok(beforeVote.ph === "talk", "아직 이야기 중", `ph=${beforeVote.ph}`);
const early = await call(0, `/api/rooms/liar/${code}`, "PATCH", { action: "vote", target: users[1].id });
ok(early.s === 409, "이야기 중에는 지목이 안 된다", `상태 ${early.s}`);

console.log(`\n${fail ? `실패 ${fail}건 · ` : ""}통과 ${pass}건`);
process.exit(fail ? 1 : 0);
