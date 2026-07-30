import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 탭에는 브랜드만 짧게 띄운다. 탭이 좁아지면 앞부분만 남기 때문에
  // "설계실 오락실 — ARCHI ARCA…" 처럼 잘리던 것을 피한다.
  title: {
    default: "ARCHIARCADE",
    template: "%s · ARCHIARCADE",
  },
  description:
    "밤샘하는 건축학도를 위한 온라인 오락실 — 9개 언어로 즐기는 건축학과 밸런스게임.",
  // archiarcade.com 은 www 로 넘긴다. 미리보기 크롤러가 리다이렉트에서 그림을 놓치는
  // 일이 있어, 실제로 200 을 주는 주소를 그대로 쓴다.
  metadataBase: new URL("https://www.archiarcade.com"),
  openGraph: {
    title: "ARCHIARCADE",
    description: "밤샘하는 건축학도를 위한 온라인 오락실",
    url: "https://www.archiarcade.com",
    siteName: "ARCHIARCADE",
    locale: "ko_KR",
    type: "website",
    // 그림 자체는 app/opengraph-image.tsx 가 만든다. 여기서 따로 지정하지 않으면
    // Next 가 그 파일을 찾아 자동으로 붙인다.
  },
};

export const viewport: Viewport = {
  themeColor: "#14162b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 원본 페이지(public/index.html)와 같은 로딩 표시·선택창 스타일을 공유한다. */}
        <link rel="stylesheet" href="/arcade-ui.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
