/**
 * 소셜 로그인 (Auth.js).
 *
 * 기존 닉네임+비밀번호 로그인(/api/auth/*)과 공존한다. 경로가 겹치지 않도록
 * basePath 를 /api/oauth 로 두었고, 구글 콘솔에 등록한 콜백 주소도
 * /api/oauth/callback/google 이다.
 *
 * 지금은 구글만 쓴다. 한국 사용자까지 구글로 덮이는지 보고, 필요해지면 카카오를
 * 추가한다 — lib/oauth-providers.ts 에 국가별 매핑을 미리 잡아두었으므로 그때는
 * 키를 넣고 아래에 한 블록을 더하는 정도로 끝난다.
 *
 * 키가 없으면 providers 가 비고, 그 경우 소셜 로그인 버튼만 사라진다. 빌드와 실행은
 * 그대로 된다.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/oauth",
  session: { strategy: "jwt" },
  // Auth.js 는 프로덕션 빌드에서 Host 헤더를 기본적으로 믿지 않는다. 콜백 주소를
  // 그 헤더로부터 만들기 때문인데, 아무 프록시나 앞에 있으면 위조될 수 있어서다.
  // 우리는 Vercel 뒤에서만 돌고 Vercel 이 Host 를 정규화해 주므로 켠다.
  // 직접 서버를 노출하는 구성으로 바꾼다면 이 값을 다시 검토해야 한다.
  trustHost: true,
  providers:
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET })]
      : [],
  callbacks: {
    async jwt({ token, profile }) {
      // 학교 인증(StudentVerification)은 별도 흐름이라 여기서 건드리지 않는다.
      // 로그인은 "같은 사람"만 이어주고, 뱃지는 학교 메일 인증으로만 붙는다.
      if (profile?.email) token.email = profile.email;
      return token;
    },
  },
});
