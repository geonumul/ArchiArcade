/**
 * 학생 뱃지 토큰.
 *
 * 계정이 없어도 뱃지를 가질 수 있어야 하므로, 인증 결과를 서명된 쿠키 하나에 담는다.
 * 서버는 이 쿠키만 보고 "이 사람은 어느 학교 학생"인지 판단하며, 위조는 서명으로 막는다.
 *
 * 쿠키에 이메일 원문은 넣지 않는다. 학교·학과만 있으면 뱃지·순위·커뮤니티가 모두
 * 동작하고, 이메일은 DB(StudentVerification)에만 남긴다.
 */
import { SignJWT, jwtVerify } from "jose";

export const BADGE_COOKIE = "aa_badge";
const TTL_SEC = 60 * 60 * 24 * 180; // 180일

export interface Badge {
  schoolDomain: string;
  /// 영문 이름. 화면에서 크게 쓴다.
  schoolName: string;
  /// 현지어 이름. 영문 옆에 작게 붙는다. 출처가 없으면 비어 있고 영문만 보인다.
  schoolLocal?: string;
  country: string;
  major: string;
  /**
   * StudentVerification 행의 id.
   *
   * 동문 디렉터리에서 "내 항목"을 고치려면 서버가 어느 행인지 알아야 하는데,
   * 이메일을 쿠키에 넣지 않기로 했으므로 대신 이 id 를 담는다. id 만으로는
   * 이메일을 역산할 수 없고, 서명이 있어 남의 id 로 바꿔치기할 수도 없다.
   *
   * 이 필드가 생기기 전에 발급된 쿠키에는 없다 — 없으면 재인증을 요구한다.
   */
  vid?: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET 이 없거나 너무 짧습니다(32자 이상 필요).");
  }
  return new TextEncoder().encode(s);
}

export async function signBadge(b: Badge): Promise<string> {
  return new SignJWT({ ...b })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(secret());
}

export async function readBadge(token: string | undefined): Promise<Badge | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { schoolDomain, schoolName, country, major, vid } = payload as Record<string, unknown>;
    if (typeof schoolDomain !== "string" || typeof major !== "string") return null;
    return {
      schoolDomain,
      schoolName: String(schoolName ?? schoolDomain),
      country: String(country ?? ""),
      major,
      vid: typeof vid === "string" ? vid : undefined,
    };
  } catch {
    return null;
  }
}

export const badgeCookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_SEC,
};
