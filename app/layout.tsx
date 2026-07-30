import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "설계실 오락실 · ARCHI ARCADE",
  description:
    "밤샘하는 건축학도를 위한 온라인 오락실 — 9개 언어로 즐기는 건축학과 밸런스게임.",
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
