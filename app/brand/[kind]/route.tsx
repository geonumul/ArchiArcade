import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * 인스타그램용 이미지.
 *
 *   /brand/profile   1080×1080  프로필 사진
 *   /brand/intro     1080×1350  "이게 뭐냐" 를 한 장으로
 *   /brand/question  1080×1350  실제 문항 한 개 (제일 잘 퍼지는 형태)
 *   /brand/school    1080×1350  학교 인증 안내
 *   /brand/story     1080×1920  스토리용
 *
 * 브라우저에서 열어 그림을 저장하면 그대로 올릴 수 있다. 디자인 도구를 따로 쓰지
 * 않는 이유는, 서비스 화면과 같은 색·같은 폰트·같은 하드섀도를 쓰려면 여기서 그리는
 * 편이 어긋날 일이 없어서다.
 *
 * 글자는 영문 로고와 한글을 함께 쓴다. 한글 픽셀 폰트(Galmuri)는 woff2 뿐인데
 * 이미지 생성기가 못 읽어서, 한글은 시스템 고딕으로 나가고 로고만 픽셀 폰트다.
 */

const C = {
  bg: "#14162b",
  panel: "#1f2340",
  panel2: "#2a2f52",
  ink: "#e8e6f0",
  dim: "#8b90b8",
  yellow: "#ffd93d",
  yellowDark: "#b8860b",
  red: "#ff5a5a",
  blue: "#4fc4ff",
  green: "#3ee06c",
  shadow: "#0a0b18",
};

const SIZES: Record<string, { width: number; height: number }> = {
  profile: { width: 1080, height: 1080 },
  intro: { width: 1080, height: 1350 },
  question: { width: 1080, height: 1350 },
  school: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

/** 아이콘의 32칸 격자를 그대로 쓰고 한 칸 크기만 바꾼다. */
function Joystick({ unit }: { unit: number }) {
  const px = (x: number, y: number, w: number, h: number, fill: string) => (
    <div
      key={`${x}-${y}-${fill}`}
      style={{ position: "absolute", left: x * unit, top: y * unit, width: w * unit, height: h * unit, background: fill }}
    />
  );
  return (
    <div style={{ position: "relative", width: 32 * unit, height: 30 * unit, display: "flex" }}>
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
  );
}

function Wordmark({ size, shadow }: { size: number; shadow: number }) {
  return (
    <div
      style={{
        fontFamily: "PressStart",
        fontSize: size,
        letterSpacing: size * 0.08,
        color: C.yellow,
        textShadow: `${shadow}px ${shadow}px 0 ${C.yellowDark}, ${shadow * 2}px ${shadow * 2}px 0 ${C.shadow}`,
      }}
    >
      ARCHIARCADE
    </div>
  );
}

/// 원본의 4px 보더 · 하드섀도를 그대로 옮긴 상자.
function Box({ children, bg = C.panel2 }: { children: React.ReactNode; bg?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: bg,
        border: `8px solid ${C.ink}`,
        boxShadow: `0 12px 0 ${C.shadow}`,
        padding: "40px 44px",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

export async function generateStaticParams() {
  return Object.keys(SIZES).map((kind) => ({ kind }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const size = SIZES[kind];
  if (!size) return new Response("not found", { status: 404 });

  const pixel = await readFile(path.join(process.cwd(), "public", "fonts", "press-start-2p.ttf"));

  /* 한글 폰트.
     이미지 생성기는 글자마다 폰트를 고르는데, 픽셀 폰트만 주면 한글 사이의 공백과
     쉼표까지 픽셀 폰트에서 가져와 자간이 벌어지고 구두점이 튄다. 그래서 한글이 있는
     폰트를 함께 넘겨 기본으로 삼는다.

     폰트 파일은 리포에 넣지 않는다(재배포 조건이 폰트마다 다르다). BRAND_KO_FONT 로
     경로를 주면 쓰고, 없으면 픽셀 폰트만으로 그린다 - 그림은 나오되 한글 간격이
     어색해진다. 이 그림들은 한 번 만들어 두고 쓰는 것이라 그걸로 충분하다. */
  const koPath = process.env.BRAND_KO_FONT;
  const ko = koPath ? await readFile(koPath).catch(() => null) : null;
  const base = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: C.bg,
    padding: 70,
  };

  let body: React.ReactElement;

  if (kind === "profile") {
    // 프로필은 아주 작게도 보이므로 조이스틱과 로고만 둔다.
    body = (
      <div style={{ ...base, gap: 40 }}>
        <Joystick unit={22} />
        <div style={{ fontFamily: "PressStart", fontSize: 62, letterSpacing: 5, color: C.yellow, textShadow: `6px 6px 0 ${C.shadow}` }}>
          ARCHI
        </div>
        <div style={{ fontFamily: "PressStart", fontSize: 62, letterSpacing: 5, color: C.yellow, marginTop: -18, textShadow: `6px 6px 0 ${C.shadow}` }}>
          ARCADE
        </div>
      </div>
    );
  } else if (kind === "intro") {
    body = (
      <div style={{ ...base, justifyContent: "space-between", paddingTop: 90, paddingBottom: 90 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <Joystick unit={13} />
          <Wordmark size={64} shadow={6} />
          <div style={{ fontSize: 22, letterSpacing: 3, color: C.blue, fontFamily: "PressStart" }}>★ FOR ARCHITECTURE STUDENTS ★</div>
        </div>

        <Box>
          <div style={{ fontSize: 34, color: C.ink, lineHeight: 1.6 }}>밤샘하다 지친</div>
          <div style={{ fontSize: 34, color: C.yellow, lineHeight: 1.6 }}>설계실 공식 딴짓 공간</div>
        </Box>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
          {[
            ["154", "문항 · 9개 언어"],
            ["100", "명까지 같은 방에서 실시간"],
            ["FREE", "가입 없이도 플레이"],
          ].map(([n, t]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ fontSize: 26, color: C.yellow, width: 150, fontFamily: "PressStart" }}>{n}</div>
              <div style={{ fontSize: 24, color: C.dim }}>{t}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 26, letterSpacing: 2, color: C.ink, fontFamily: "PressStart" }}>archiarcade.com</div>
      </div>
    );
  } else if (kind === "question") {
    body = (
      <div style={{ ...base, justifyContent: "space-between", paddingTop: 90, paddingBottom: 90 }}>
        <div style={{ fontSize: 24, letterSpacing: 3, color: C.blue }}>건축학과 밸런스게임</div>

        <div style={{ fontSize: 40, color: C.ink, textAlign: "center", lineHeight: 1.5 }}>
          졸업까지 무기 하나만
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26, width: "100%" }}>
          <Box bg={C.panel2}>
            <div style={{ fontSize: 24, color: C.yellow, marginBottom: 12, fontFamily: "PressStart" }}>A</div>
            <div style={{ fontSize: 30, color: C.ink, lineHeight: 1.5 }}>손그림만 평생</div>
          </Box>
          <div style={{ fontSize: 30, color: C.dim, fontFamily: "PressStart", width: "100%", display: "flex", justifyContent: "center" }}>VS</div>
          <Box bg={C.panel2}>
            <div style={{ fontSize: 24, color: C.yellow, marginBottom: 12, fontFamily: "PressStart" }}>B</div>
            <div style={{ fontSize: 30, color: C.ink, lineHeight: 1.5 }}>모형만, 도면은 면제</div>
          </Box>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 22, color: C.dim }}>당신의 선택은?</div>
          <div style={{ fontSize: 24, letterSpacing: 2, color: C.yellow, fontFamily: "PressStart" }}>archiarcade.com</div>
        </div>
      </div>
    );
  } else if (kind === "school") {
    body = (
      <div style={{ ...base, justifyContent: "space-between", paddingTop: 90, paddingBottom: 90 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 70 }}>🎓</div>
          <div style={{ fontSize: 34, color: C.yellow, letterSpacing: 2 }}>학교 인증</div>
        </div>

        <Box>
          <div style={{ fontSize: 28, color: C.ink, lineHeight: 1.7 }}>학교 메일로 인증하면</div>
          <div style={{ fontSize: 28, color: C.yellow, lineHeight: 1.7 }}>내 표가 우리 학교 것이 됩니다</div>
        </Box>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
          {[
            ["🏫", "학교별 순위 경쟁"],
            ["👥", "같은 학교 동문 찾기"],
            ["🔒", "이메일은 공개되지 않음"],
          ].map(([i, t]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ fontSize: 34 }}>{i}</div>
              <div style={{ fontSize: 26, color: C.dim }}>{t}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 24, letterSpacing: 2, color: C.ink, fontFamily: "PressStart" }}>archiarcade.com</div>
      </div>
    );
  } else {
    // story
    body = (
      <div style={{ ...base, justifyContent: "space-between", paddingTop: 200, paddingBottom: 200 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
          <Joystick unit={17} />
          <Wordmark size={54} shadow={6} />
        </div>

        <Box>
          <div style={{ fontSize: 38, color: C.ink, lineHeight: 1.6 }}>지금 설계실에서</div>
          <div style={{ fontSize: 38, color: C.yellow, lineHeight: 1.6 }}>다 같이 한 판</div>
        </Box>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <div style={{ fontSize: 26, color: C.dim }}>방 만들고 코드만 알려주면 끝</div>
          <div style={{ fontSize: 30, letterSpacing: 2, color: C.yellow, fontFamily: "PressStart" }}>archiarcade.com</div>
        </div>
      </div>
    );
  }

  return new ImageResponse(body, {
    ...size,
    fonts: [
      // 먼저 오는 것이 기본 글꼴이 된다. 한글 폰트를 앞에 둬야 공백과 구두점이 그쪽에서 나온다.
      ...(ko ? [{ name: "Sans", data: ko, style: "normal" as const, weight: 400 as const }] : []),
      { name: "PressStart", data: pixel, style: "normal" as const, weight: 400 as const },
    ],
  });
}
