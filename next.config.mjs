/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 폰트는 내용 해시가 바뀌지 않는 OFL 임베드 자산 — 장기 캐시
  async headers() {
    return [
      {
        source: "/fonts/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
