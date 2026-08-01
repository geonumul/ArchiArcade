import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";
import { GearShelf } from "@/components/GearShelf";
import { GearTeaser } from "@/components/GearTeaser";

export const runtime = "nodejs";
/// 쿠키를 보고 무엇을 그릴지 정하므로 미리 만들어 둘 수 없다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "밤샘 장비",
  description: "설계실에서 반드시 떨어지는 것들 — 무엇이 필요한지와, 온라인·오프라인 어디서 구하는지.",
};

/**
 * 밤샘 장비 — 지금은 관리자에게만 열려 있다.
 *
 * 판단을 서버에서 하는 이유. 화면에서 감추는 방식이었다면 품목과 제휴 링크가 그대로
 * 자바스크립트 번들에 실려 나가고, 개발자 도구를 열 줄 아는 사람에게는 열린 것과
 * 같다. 여기서 갈라 두면 관리자가 아닌 사람의 브라우저에는 목록이 애초에 도착하지
 * 않는다 - "닫아 뒀다" 가 말 그대로가 된다.
 *
 * 관리자가 아니면 404 를 주지 않고 관심 등록 화면을 준다. 이 페이지는 숨겨야 하는
 * 것이 아니라 아직 안 연 것이고, 누가 원하는지 세어 두는 편이 여는 시점을 정하는 데
 * 쓸모 있다(/api/admin/funnel 과 같은 표에 쌓인다).
 */
export default async function GearPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: raw } = await searchParams;
  // 오락실은 아홉 언어지만 이 화면은 두 벌뿐이다. 한국어가 아니면 영어로 받는다.
  const lang = !raw || raw === "ko" ? "ko" : "en";

  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  const admin = Boolean(claims && isAdminName(claims.name));

  return admin ? <GearShelf lang={lang} /> : <GearTeaser lang={lang} />;
}
