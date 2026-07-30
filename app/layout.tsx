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
  metadataBase: new URL("https://archiarcade.com"),
  openGraph: {
    title: "ARCHIARCADE",
    description: "밤샘하는 건축학도를 위한 온라인 오락실",
    url: "https://archiarcade.com",
    siteName: "ARCHIARCADE",
    locale: "ko_KR",
    type: "website",
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
      <body>{children}</body>
    </html>
  );
}
