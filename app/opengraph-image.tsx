import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "ARCHI ARCADE — an online arcade for architecture students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * 링크를 공유했을 때 뜨는 미리보기 그림.
 *
 * 글자는 영문 로고만 쓴다. 이미지 생성기가 읽을 수 있는 폰트는 ttf/otf/woff 뿐이고
 * 우리 한글 폰트(Galmuri)는 woff2 만 있어서, 한글을 넣으면 글자가 빈칸으로 나온다.
 * 한글 설명은 og:description 으로 따로 나가므로 미리보기에는 그대로 보인다.
 *
 * 조이스틱은 app/icon.svg 와 같은 형태를 사각형 div 로 다시 그린 것이다. 이미지
 * 생성기는 SVG 파일을 그대로 못 불러오므로 도형을 직접 쌓는다.
 */
export default async function Image() {
  const font = await readFile(path.join(process.cwd(), "public", "fonts", "press-start-2p.ttf"));

  const C = {
    bg: "#14162b",
    panel: "#1f2340",
    ink: "#e8e6f0",
    dim: "#8b90b8",
    yellow: "#ffd93d",
    yellowDark: "#b8860b",
    red: "#ff5a5a",
    blue: "#4fc4ff",
    green: "#3ee06c",
    shadow: "#0a0b18",
  };

  // 아이콘의 32칸 격자를 그대로 쓰고 한 칸을 6px 로 키운다.
  const U = 6;
  const px = (x: number, y: number, w: number, h: number, fill: string) => (
    <div
      style={{
        position: "absolute",
        left: x * U,
        top: y * U,
        width: w * U,
        height: h * U,
        background: fill,
      }}
    />
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: C.bg,
          // 원본 화면의 점 패턴. 링크 미리보기에서도 같은 질감으로 읽히게 한다.
          backgroundImage: `radial-gradient(${C.ink}22 2px, transparent 2px)`,
          backgroundSize: "48px 48px",
          fontFamily: "PressStart",
        }}
      >
        {/* 조이스틱 — 아이콘과 같은 배치(왼쪽 스틱 · 오른쪽 버튼) */}
        <div style={{ position: "relative", width: 32 * U, height: 30 * U, display: "flex" }}>
          {px(7, 4, 6, 2, C.red)}
          {px(6, 6, 8, 4, C.red)}
          {px(7, 10, 6, 2, C.red)}
          {px(8, 6, 2, 2, C.ink)}
          {px(9, 12, 3, 6, C.ink)}
          {px(2, 18, 28, 8, C.yellow)}
          {px(2, 24, 28, 2, C.yellowDark)}
          {px(17, 19, 5, 4, C.blue)}
          {px(24, 19, 5, 4, C.green)}
          {px(1, 28, 30, 2, C.ink)}
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 92,
            letterSpacing: 8,
            color: C.yellow,
            // 원본 로고의 하드섀도를 그대로 흉내낸다 — 번지는 그림자는 쓰지 않는다.
            textShadow: `8px 8px 0 ${C.yellowDark}, 16px 16px 0 ${C.shadow}`,
          }}
        >
          ARCHIARCADE
        </div>

        <div style={{ marginTop: 44, fontSize: 26, letterSpacing: 4, color: C.blue }}>
          ★ FOR ARCHITECTURE STUDENTS ★
        </div>

        <div style={{ marginTop: 30, fontSize: 20, letterSpacing: 2, color: C.dim }}>
          9 LANGUAGES · 154 QUESTIONS · LIVE ROOMS
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "PressStart", data: font, style: "normal", weight: 400 }],
    }
  );
}
