"use client";

import Link from "next/link";

/**
 * 학교 인증·순위·동문 페이지가 앉는 캐비닛.
 *
 * 원본 index.html 의 바깥 구조(.cab → .main-col → .pixel-box → .screen → .stack)를
 * 그대로 쓴다. 클래스가 같으면 globals.css 가 원본과 같은 화면을 그려 주므로,
 * 이 페이지들은 오락실에서 나온 게 아니라 옆 화면으로 넘어간 것처럼 보인다.
 *
 * 사이드 독은 없으므로 `.cab` 이 넓은 화면에서 2단 그리드로 벌어지지 않게 `solo` 를 붙인다.
 */
export function Cabinet({
  hudRight = "SCHOOL",
  title,
  children,
}: {
  hudRight?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cab solo">
      <div className="hud">
        <span>READY</span>
        <span className="mid">ARCHI ARCADE</span>
        <span>{hudRight}</span>
      </div>

      <div className="main-col">
        <div className="pixel-box">
          <div className="screen">
            <Link className="top-back" href="/" aria-label="오락실로 돌아가기">
              ←
            </Link>
            <div className="stack">
              <div className="logo" style={{ fontSize: 22 }}>
                {title}
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
