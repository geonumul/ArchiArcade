/**
 * 페이지를 실제로 띄워 화면이 살아 있는지 본다.
 *   npx next start -p 3100
 *   node scripts/verify-page.mjs http://127.0.0.1:3100
 *
 * 파일을 읽어 문법만 보는 검사로는 못 잡는 종류의 고장이 있다. index.html 은
 * 인라인 스크립트 하나가 전부라, 위쪽에서 예외가 한 번 나면 그 아래가 통째로
 * 실행되지 않는다. 문법은 멀쩡하고 빌드도 통과하는데 화면 절반이 죽는다.
 *
 * 실제로 그렇게 됐다. UI.zh / UI.ja / UI.tw 는 파일 아래쪽에서 만들어지는데 그보다
 * 위에서 Object.assign(UI.tw, ...) 을 했더니 undefined 에 붙이려다 예외가 났고,
 * 그 뒤의 게임 화면과 성향 카드가 전부 붙지 않았다. 이 검사가 그걸 잡는다.
 */
/* jsdom 은 이 검사에만 쓰므로 의존성에 넣지 않았다. 없으면 안내하고 조용히 빠진다 -
   빌드나 배포가 이 검사 하나 때문에 막히면 안 된다. */
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import("jsdom"));
} catch {
  console.log("jsdom 이 없어 건너뜁니다.  npm i -D jsdom  후 다시 실행하세요.");
  process.exit(0);
}

const BASE = process.argv[2] || "http://127.0.0.1:3100";
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.stack || e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const html = await (await fetch(BASE + "/")).text();
const dom = new JSDOM(html, {
  url: BASE + "/",
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  /* jsdom 에는 fetch 가 없다. 페이지는 첫 줄부터 fetch 를 쓰므로 Node 것을 넣어 준다.
     상대 경로를 못 푸니 서버 주소를 붙여 준다. */
  beforeParse(w) {
    w.fetch = (input, init) => {
      const url = typeof input === "string" && input.startsWith("/") ? BASE + input : input;
      return globalThis.fetch(url, init);
    };
    w.Headers = globalThis.Headers;
    w.Request = globalThis.Request;
    w.Response = globalThis.Response;
    w.ReadableStream = globalThis.ReadableStream;
  },
});

// 스크립트가 다 붙을 때까지 기다린다
await new Promise((r) => setTimeout(r, 2500));

const { window } = dom;
const $ = (id) => window.document.getElementById(id);

const checks = [
  ["새 카트리지가 있다", !!$("cartArchq")],
  ["문제 은행이 실렸다", !!(window.ARCHQ && window.ARCHQ.bld && window.ARCHQ.bld.length > 60)],
  ["게임 화면이 있다", !!$("vArchq") && !!$("vArchqEnd")],
  ["성향 카드 자리가 있다", !!$("profCard")],
  ["리액션 로그인 안내가 있다", !!$("reactNeed")],
  ["로그인 전에는 태그가 PLAY 가 아니다", $("aqCartTag") && $("aqCartTag").textContent !== "PLAY ▶"],
  ["잠긴 표시(gated)가 붙었다", $("cartArchq") && $("cartArchq").className.includes("gated")],
];

let bad = 0;
for (const [label, ok] of checks) {
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}`);
}

// 실제로 한 판 돌려 본다 - 로그인 안 한 상태라 로그인 화면으로 가야 한다
$("cartArchq").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const wentToAuth = !$("vAuth").classList.contains("hidden");
console.log(`  ${wentToAuth ? "OK  " : "FAIL"}  로그인 안 하고 누르면 로그인 화면으로 간다`);
if (!wentToAuth) bad++;
const nudge = $("auErr").textContent;
console.log(`        안내문: "${nudge}"`);
if (!nudge) bad++;

// 로그인한 척하면 모드 고르는 화면이 나와야 한다
/* USER 는 let 이라 window 에 없다. 함수 선언은 window 에 올라오므로 setUser 를 쓴다. */
window.setUser({ name: "tester", email: "t@example.com", plays: 0, minorPicks: 0 });
$("cartArchq").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 300));
const onModes = !$("vArchqMode").classList.contains("hidden");
const modeBtns = $("aqModes").querySelectorAll(".aq-mode").length;
console.log(`  ${onModes ? "OK  " : "FAIL"}  로그인하면 모드 화면이 나온다`);
console.log(`  ${modeBtns === 5 ? "OK  " : "FAIL"}  모드가 5개다  (${modeBtns}개)`);
if (!onModes || modeBtns !== 5) bad++;
console.log(`        모드: ${[...$("aqModes").querySelectorAll(".aq-mode")].map((b) => b.textContent).join(" / ")}`);

// 타임어택을 골라 한 판 - 시계가 하나로 도는지까지 본다
window.aqStart("t60");
await new Promise((r) => setTimeout(r, 300));
const playing = !$("vArchq").classList.contains("hidden");
const opts = $("aqChoices").querySelectorAll(".aq-c").length;
const names = [...$("aqChoices").querySelectorAll(".aq-c")].map((b) => b.textContent);
const uniqueOpts = new Set(names).size === names.length;
console.log(`  ${playing ? "OK  " : "FAIL"}  타임어택이 시작된다`);
console.log(`  ${opts === 4 ? "OK  " : "FAIL"}  보기가 4개 그려진다  (${opts}개)`);
console.log(`  ${uniqueOpts ? "OK  " : "FAIL"}  보기에 같은 이름이 두 번 나오지 않는다`);
console.log(`        문제: "${$("aqName").textContent}"  힌트: "${$("aqHint").textContent}"`);
if (!playing || opts !== 4 || !uniqueOpts) bad++;

/* 무음 파일이 실제로 받아지는지. 이게 404 면 아이폰 무음 스위치 문제가 그대로 남는데,
   화면에는 아무 표시도 나지 않아 알 길이 없다. */
const wav = await fetch(BASE + "/silence.wav");
const wavOk = wav.ok && Number(wav.headers.get("content-length")) > 1000;
console.log(`  ${wavOk ? "OK  " : "FAIL"}  무음 파일이 받아진다  (${wav.status})`);
if (!wavOk) bad++;

if (errors.length) {
  console.log("\n콘솔 오류:");
  errors.slice(0, 10).forEach((e) => console.log("  " + e));
}
console.log(`\n${bad ? `실패 ${bad}건` : "전체 통과"} · 콘솔 오류 ${errors.length}건`);
dom.window.close();
process.exit(bad || errors.length ? 1 : 0);
