/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /* 설계자 맞히기 방은 서버가 문제를 뽑고 채점하므로 문제 은행을 읽어야 한다. 그 은행은
     화면이 쓰는 public/quiz-architect.js 하나뿐이고, 서버용 사본을 두면 언젠가 한쪽만
     고쳐져 방이 낸 문제와 채점하는 정답이 어긋난다.
     그런데 public/ 은 정적 자산으로만 배포되고 함수 번들에는 들어가지 않는다. import 가
     아니라 fs 로 읽기 때문에 추적도 되지 않아, 여기에 적어 두지 않으면 로컬에서는 되고
     배포하면 "문제를 불러오지 못했어요" 만 나온다. */
  outputFileTracingIncludes: {
    "/api/rooms/archq/**": ["./public/quiz-architect.js"],
  },

  // 루트는 원본 index.html 을 그대로 내보낸다. 화면을 React 로 다시 그리면
  // 아무리 옮겨도 원본과 미세하게 어긋나기 때문에, 원본 자체를 서빙한다.
  // beforeFiles 라야 app/ 라우팅보다 먼저 잡힌다.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
    };
  },

  async headers() {
    return [
      {
        // 폰트는 내용 해시가 바뀌지 않는 OFL 임베드 자산 — 장기 캐시
        source: "/fonts/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // 원본 HTML 과 그 부속 스크립트는 배포할 때마다 즉시 갱신돼야 한다.
        // public/ 기본 캐시 정책에 맡기면 옛 화면이 남는다.
        source: "/index.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        // 원본에 붙는 부속 파일들. 와일드카드(`:file*`)는 접두·접미가 필요해
        // 여기서는 못 쓰므로 하나씩 적는다.
        source: "/:file(arcade-bridge\\.js|arcade-ui\\.js|arcade-ui\\.css|arcade-school\\.js)",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
