import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * 접속한 나라 두 글자.
 *
 * 첫 화면의 언어를 고를 때 브라우저 언어로 먼저 판단하고, 그것이 우리가 가진 9개
 * 언어에 없을 때만 이걸 물어본다. 브라우저 언어가 그 사람이 실제로 읽고 싶은
 * 언어이고, 접속 위치는 그 다음이다 - 미국에 있는 한국 학생은 한국어를 원한다.
 *
 * 나라 정보는 Vercel 이 요청 헤더에 붙여 준다. 저장하지 않고 그대로 돌려주기만 하며,
 * IP 자체는 읽지도 남기지도 않는다.
 */
export function GET(req: Request) {
  const country =
    req.headers.get("x-vercel-ip-country") ??
    req.headers.get("cf-ipcountry") ??
    null;

  return NextResponse.json(
    { country },
    // 사람마다 다른 값이므로 중간 캐시에 담기면 안 된다.
    { headers: { "cache-control": "private, no-store" } }
  );
}
