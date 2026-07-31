import type { Metadata } from "next";
import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";

export const metadata: Metadata = {
  title: "브랜드 자산",
  description: "인스타그램에 올릴 프로필 사진과 게시물 이미지.",
  // 검색에 잡힐 이유가 없는 내부용 페이지다.
  robots: { index: false, follow: false },
};

/**
 * 인스타그램용 이미지 모음.
 *
 * 이미지는 public/brand 에 미리 만들어 둔 PNG 다. 만드는 코드는
 * app/brand/[kind]/route.tsx 에 있고, 한글 폰트를 붙여 다시 돌리면 갱신된다.
 *   BRAND_KO_FONT=C:\Windows\Fonts\malgun.ttf npx next dev
 *   curl http://127.0.0.1:3000/brand/profile -o public/brand/profile.png
 */

const ASSETS = [
  { file: "profile", size: "1080 × 1080", label: "프로필 사진", note: "계정 사진. 작게 줄여도 조이스틱이 읽힙니다" },
  { file: "intro", size: "1080 × 1350", label: "소개 게시물", note: "첫 게시물용. 이게 뭐 하는 곳인지 한 장으로" },
  { file: "question", size: "1080 × 1350", label: "문항 게시물", note: "제일 잘 퍼지는 형태. 댓글로 A/B 를 받게 됩니다" },
  { file: "school", size: "1080 × 1350", label: "학교 인증 안내", note: "인증을 늘리는 것이 목적일 때" },
  { file: "story", size: "1080 × 1920", label: "스토리", note: "세로 전체. 링크 스티커와 함께" },
];

export default function BrandPage() {
  return (
    <Cabinet title="브랜드 자산" hudRight="BRAND">
      <div className="note">
        그림을 눌러 저장한 뒤 그대로 올리면 됩니다. 서비스 화면과 같은 색·같은 폰트로
        그려서 계정과 사이트가 따로 놀지 않습니다.
      </div>

      {ASSETS.map((a) => (
        <div key={a.file} className="field" style={{ textAlign: "left" }}>
          <label>
            {a.label} · {a.size}
          </label>
          <a href={`/brand/${a.file}.png`} download>
            {/* 원본은 1080px 이라 화면 폭에 맞춰 줄여 보여 준다. */}
            <img
              src={`/brand/${a.file}.png`}
              alt={a.label}
              style={{
                width: "100%",
                display: "block",
                border: "4px solid var(--border)",
                boxShadow: "0 5px 0 var(--shadow)",
              }}
            />
          </a>
          <div className="note" style={{ textAlign: "left", fontSize: 12, marginTop: 8 }}>
            {a.note}
          </div>
        </div>
      ))}

      <div className="comm-head" style={{ marginTop: 6 }}>
        ▼ 계정 소개글 ▼
      </div>

      <div className="note" style={{ textAlign: "left", lineHeight: 1.9 }}>
        밤샘하는 건축학도의 딴짓 공간
        <br />
        154문항 밸런스게임 · 9개 언어
        <br />
        방 만들고 코드만 알려주면 다 같이
        <br />
        학교 메일 인증하면 학교 순위에 내 표가
        <br />
        archiarcade.com
      </div>

      <div className="comm-head" style={{ marginTop: 6 }}>
        ▼ 해시태그 ▼
      </div>

      <div className="note" style={{ textAlign: "left", lineHeight: 1.9, fontSize: 13 }}>
        #건축학과 #건축학도 #설계실 #밤샘 #건축과 #대학생
        <br />
        #밸런스게임 #건축전공 #건축설계 #과제
      </div>

      <Link className="btn kr gray" href="/">
        ← 오락실로
      </Link>
    </Cabinet>
  );
}
