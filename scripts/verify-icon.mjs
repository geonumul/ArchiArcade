/**
 * 아이콘 SVG 문법 검사.
 *   npm run verify:icon
 *
 * 손으로 쓴 SVG 는 XML 이고, XML 은 브라우저가 조용히 통째로 거부하는 실수가 몇 가지
 * 있다. 실제로 주석 안에 CSS 변수 이름을 그대로 적었다가(하이픈 두 개) 파일 전체가
 * 파싱 실패해 파비콘이 아예 뜨지 않은 적이 있다. 그때 검증이 rect 좌표만 정규식으로
 * 훑는 것이어서 문법 오류를 못 잡았다 — 그래서 여기서는 문법을 먼저 본다.
 *
 * 외부 XML 파서를 쓰지 않는 이유: 파비콘 하나 검사하려고 무거운 의존성을 넣을 일은
 * 아니고, 브라우저가 거부하는 패턴은 손으로 쓰는 범위에서 몇 가지로 좁다.
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const files = argv.slice(2);
const targets = files.length ? files : ["app/icon.svg"];

let fails = 0;
const ok = (label, extra) => console.log("OK   " + label + (extra !== undefined ? "  → " + extra : ""));
const bad = (label, extra) => {
  fails++;
  console.log("FAIL " + label + (extra !== undefined ? "  → " + extra : ""));
};

for (const file of targets) {
  console.log("── " + file + " ──");
  const src = readFileSync(file, "utf8");

  // ── 1. 주석 ─────────────────────────────────────────────
  const opens = (src.match(/<!--/g) || []).length;
  const closes = (src.match(/-->/g) || []).length;
  if (opens !== closes) bad("주석 열고 닫기", `<!-- ${opens}개 · --> ${closes}개`);
  else ok("주석 열고 닫기", opens + "개");

  const comments = [...src.matchAll(/<!--([\s\S]*?)-->/g)];
  const illegal = comments.filter((m) => m[1].includes("--") || m[1].endsWith("-"));
  if (illegal.length) {
    const at = src.slice(0, illegal[0].index).split("\n").length;
    bad("주석에 하이픈 두 개 없음", `${at}행 근처 — XML 주석에는 -- 를 쓸 수 없다`);
  } else ok("주석에 하이픈 두 개 없음", comments.length + "개 확인");

  // 문법 검사는 주석을 걷어낸 뒤에 한다
  const body = src.replace(/<!--[\s\S]*?-->/g, "");

  // ── 2. 엔티티 ───────────────────────────────────────────
  const amps = [...body.matchAll(/&(?!(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g)];
  if (amps.length) bad("맨 & 없음", amps.length + "군데 — &amp; 로 써야 한다");
  else ok("맨 & 없음");

  // ── 3. 태그 짝 ──────────────────────────────────────────
  const stack = [];
  let broken = null;
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, slash, name, rawAttrs] = m;
    // 속성 부분이 닫는 슬래시까지 먹는다(`/` 는 속성 문자로도 허용되는 글자다).
    // 그래서 끝의 슬래시를 여기서 떼어 내고 스스로 닫는 태그로 센다.
    const selfClosing = /\/\s*$/.test(rawAttrs);
    const attrs = rawAttrs.replace(/\/\s*$/, "");
    if (attrs.includes("<")) { broken = `<${name}> 속성 안에 < 가 있다`; break; }
    if (slash) {
      if (stack.pop() !== name) { broken = `</${name}> 가 짝이 맞지 않는다`; break; }
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (broken) bad("태그 짝", broken);
  else if (stack.length) bad("태그 짝", "닫히지 않음: " + stack.join(", "));
  else ok("태그 짝");

  // ── 4. 루트와 좌표계 ────────────────────────────────────
  const root = body.match(/<svg\b([^>]*)>/);
  if (!root) { bad("루트 svg"); continue; }
  ok("루트 svg");

  const vb = root[1].match(/viewBox="([^"]*)"/);
  if (!vb) bad("viewBox");
  else ok("viewBox", vb[1]);
  const [, , vw, vh] = (vb ? vb[1] : "0 0 0 0").split(/\s+/).map(Number);

  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(root[1])) {
    bad("xmlns", "없으면 파일로 열었을 때 그림으로 인식되지 않는다");
  } else ok("xmlns");

  // ── 5. 도형 ─────────────────────────────────────────────
  const rects = [...body.matchAll(/<rect\b([^>]*)\/>/g)].map((m) => {
    const a = {};
    for (const p of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[p[1]] = p[2];
    return a;
  });
  if (!rects.length) bad("rect 있음");
  else ok("rect 있음", rects.length + "개");

  const outside = rects.filter((r) => {
    const x = Number(r.x ?? 0), y = Number(r.y ?? 0);
    const w = Number(r.width), h = Number(r.height);
    return !Number.isFinite(w + h) || x < 0 || y < 0 || x + w > vw || y + h > vh;
  });
  if (outside.length) bad("viewBox 안에 들어옴", outside.length + "개가 벗어남");
  else ok("viewBox 안에 들어옴");

  const fills = [...new Set(rects.map((r) => r.fill))];
  const badFill = fills.filter((f) => !/^#[0-9a-fA-F]{3,8}$/.test(f ?? ""));
  if (badFill.length) bad("fill 색 형식", badFill.join(" "));
  else ok("fill 색 형식", fills.length + "색: " + fills.join(" "));

  // ── 6. 16px 에서 읽히는지 ───────────────────────────────
  // 사각형만 쓰므로 직접 찍어 확인할 수 있다. 배경색만 남으면 아무것도 안 보인다는 뜻이다.
  if (vw === 32 && vh === 32 && rects.length) {
    const grid = Array.from({ length: 32 }, () => Array(32).fill(rects[0].fill));
    for (const r of rects) {
      for (let y = Number(r.y ?? 0); y < Number(r.y ?? 0) + Number(r.height); y++) {
        for (let x = Number(r.x ?? 0); x < Number(r.x ?? 0) + Number(r.width); x++) {
          if (grid[y]) grid[y][x] = r.fill;
        }
      }
    }
    const distinct = new Set();
    const lines = [];
    for (let y = 0; y < 32; y += 2) {
      let row = "";
      for (let x = 0; x < 32; x += 2) {
        const c = {};
        for (const dy of [0, 1]) for (const dx of [0, 1]) {
          const v = grid[y + dy][x + dx];
          c[v] = (c[v] || 0) + 1;
        }
        const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
        distinct.add(top);
        row += top === rects[0].fill ? "·" : "#";
      }
      lines.push("     " + row);
    }
    if (distinct.size < 2) bad("16px 에서 형태가 남음", "배경만 보인다");
    else {
      ok("16px 에서 형태가 남음", distinct.size + "색이 살아남음");
      lines.forEach((l) => console.log(l));
    }
  }
}

console.log("\n" + (fails === 0 ? "✓ 전부 통과" : "✗ 실패 " + fails + "건"));
exit(fails === 0 ? 0 : 1);
