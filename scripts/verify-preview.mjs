/**
 * 링크 미리보기(Open Graph) 검사.
 *   npm run verify:preview                     → public/index.html 태그만
 *   npm run verify:preview -- https://…        → 그 주소의 실제 응답까지
 *
 * 루트는 Next 라우트가 아니라 정적 파일이라 app/ 의 메타데이터가 자동으로 붙지 않는다.
 * 그래서 태그가 빠져도 화면은 멀쩡하고, 링크를 공유해 봐야 미리보기가 안 뜬다는 걸
 * 알게 된다. 실제로 그 상태로 배포돼 있었으므로 여기서 막는다.
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const base = argv[2];
let fails = 0;
const ok = (l, x) => console.log("OK   " + l + (x !== undefined ? "  → " + x : ""));
const bad = (l, x) => { fails++; console.log("FAIL " + l + (x !== undefined ? "  → " + x : "")); };

const html = readFileSync("public/index.html", "utf8").slice(0, 8000);

const meta = (key) => {
  const m = html.match(
    new RegExp(`<meta\\s+(?:property|name)="${key.replace(/[:.]/g, "\\$&")}"\\s+content="([^"]*)"`, "i")
  );
  return m ? m[1] : null;
};

console.log("── public/index.html ──");

// 미리보기 카드를 만들려면 이 넷이 반드시 있어야 한다.
for (const key of ["og:title", "og:description", "og:image", "og:url"]) {
  const v = meta(key);
  if (v) ok(key, v.length > 54 ? v.slice(0, 54) + "…" : v);
  else bad(key, "없음");
}

// 상대 경로는 크롤러가 따라오지 못한다 — 그림이 조용히 빠진다.
for (const key of ["og:image", "og:url", "twitter:image"]) {
  const v = meta(key);
  if (!v) continue;
  if (/^https:\/\//.test(v)) ok(key + " 절대 주소");
  else bad(key + " 절대 주소", v);
}

// 큰 카드로 뜨게 하는 값. summary 로 두면 작은 썸네일이 된다.
const card = meta("twitter:card");
if (card === "summary_large_image") ok("twitter:card", card);
else bad("twitter:card", card ?? "없음");

// 카카오톡처럼 크기를 미리 읽는 크롤러가 있어 같이 적어 준다.
const w = meta("og:image:width"), h = meta("og:image:height");
if (w === "1200" && h === "630") ok("og:image 크기", `${w}x${h}`);
else bad("og:image 크기", `${w ?? "없음"}x${h ?? "없음"} (1200x630 권장)`);

const title = html.match(/<title>([^<]*)<\/title>/);
if (title) ok("<title>", title[1]);
else bad("<title>", "없음");

// ── 주소를 받았으면 실제 응답까지 확인한다 ──────────────────
if (base) {
  const root = base.replace(/\/$/, "");
  console.log(`\n── ${root} ──`);
  try {
    const page = await fetch(root + "/", { redirect: "follow" });
    ok("루트 응답", page.status + "");
    const body = await page.text();
    const live = body.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i);
    if (!live) bad("배포본에 og:image", "없음 — 배포가 아직 안 됐을 수 있다");
    else {
      ok("배포본에 og:image", live[1]);
      // 태그에는 프로덕션 주소가 박혀 있다. 지금 확인하려는 서버에서 같은 경로를
      // 가져와야 로컬 실행이 의미가 있다 — 아니면 아직 배포 안 된 주소를 찌른다.
      const target = root + new URL(live[1]).pathname;
      if (target !== live[1]) console.log("     (이 서버 기준으로 확인: " + target + ")");
      const img = await fetch(target, { redirect: "follow" });
      const type = img.headers.get("content-type") ?? "";
      if (img.ok && type.startsWith("image/")) {
        const buf = Buffer.from(await img.arrayBuffer());
        const isPng = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
        if (isPng) {
          const [pw, ph] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
          if (pw === 1200 && ph === 630) ok("그림 실제 크기", `${pw}x${ph} · ${buf.length}B`);
          else bad("그림 실제 크기", `${pw}x${ph} (태그와 다르면 잘려 보인다)`);
        } else bad("그림이 PNG", type + " — 미리보기 크롤러 대부분이 SVG 를 못 읽는다");
      } else bad("그림 응답", img.status + " " + type);
    }
  } catch (e) {
    bad("주소 확인", e.message.split("\n")[0]);
  }
}

console.log("\n" + (fails === 0 ? "✓ 전부 통과" : "✗ 실패 " + fails + "건"));
exit(fails === 0 ? 0 : 1);
