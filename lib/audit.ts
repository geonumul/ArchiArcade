/**
 * 관리자 접속기록 남기기.
 *
 * 「개인정보의 안전성 확보조치 기준」(개인정보보호위원회 고시) 제8조는 개인정보취급자가
 * 개인정보처리시스템에 접속한 기록을 1년 이상 보관하도록 정한다. 해도 되는 일이 아니라
 * 해야 하는 일이라, 관리자가 남의 개인정보를 읽거나 고치는 자리마다 이 함수를 부른다.
 *
 * 기록 대상은 운영하는 쪽뿐이다. 게임하러 온 사람의 접속은 여기 남기지 않는다 -
 * 2026-10-31 시행 개정문이 「접속한 자(다만, 정보주체는 제외한다)」로 못 박은 그대로다.
 * 방문자 흐름은 개인을 특정하지 않는 VisitStat 이 따로 세고 있으니 헷갈리지 말 것.
 *
 * 고시 제2조제3호가 요구하는 다섯 항목(식별자·접속일시·접속지 정보·처리한 정보주체
 * 정보·수행업무)을 한 줄에 모두 채운다. 하나라도 비면 기록으로 인정되지 않는다.
 */
import { hasDatabase, prisma } from "@/lib/db";

/// 긴 값이 들어와도 표가 부풀지 않게 자른다. 되짚는 데 필요한 만큼만 남으면 된다.
const SUBJECT_MAX = 300;
const ACTION_MAX = 60;

/// 제어문자는 공백으로 눕힌다. 줄바꿈이 섞이면 한 줄짜리 기록이 뷰어에서 여러 줄로
/// 보이고, 그러면 점검하는 사람이 없는 접속을 있는 것처럼 읽게 된다.
function clean(v: string, max: number): string {
  return v.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "(미상)";
}

/**
 * 접속지 정보를 뽑는다.
 *
 * 이 리포는 다른 어디에서도 IP 원문을 저장하지 않는다. 도배 방지조차 ipKey() 로 해시해
 * 쓰고 원문은 남기지 않는다(lib/ratelimit.ts). 여기만 원문인 것은 방침이 바뀌어서가
 * 아니라 고시 제2조제3호가 "접속지 정보"를 접속기록의 필수 항목으로 요구하기 때문이다.
 * 해시로 바꾸면 기록으로 성립하지 않는다. 다른 기능을 만들 때 이 함수를 IP 를 저장해도
 * 되는 선례로 삼지 말 것.
 */
function accessPoint(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export interface AdminAccess {
  /// 식별자. 관리자 계정 이름.
  admin: string;
  /// 처리한 정보주체 정보. 누구의 개인정보를 건드렸는지 되짚을 수 있을 만큼.
  subject: string;
  /// 수행업무. "동문목록 조회", "제보 삭제" 같은 짧은 서술.
  action: string;
}

/**
 * 한 줄 남긴다. 무슨 일이 있어도 던지지 않는다.
 *
 * 기록이 실패했다고 관리자 화면까지 막으면 급할 때 로그를 꺼 두고 싶어지고, 그러면 표가
 * 있으나 마나 해진다. 그래서 실패는 삼킨다. 대신 응답을 보낸 뒤에 몰래 쓰는 방식은 쓰지
 * 않는다 - 서버리스에서는 응답 직후 함수가 그대로 얼어붙어 기록이 통째로 사라질 수 있고,
 * 법이 요구하는 기록이 조용히 비는 쪽이 몇 밀리초 느린 것보다 훨씬 나쁘다.
 */
export async function logAdminAccess(req: Request, opts: AdminAccess): Promise<void> {
  if (!hasDatabase || !prisma) return;
  try {
    await prisma.adminAccessLog.create({
      data: {
        admin: clean(opts.admin, 64),
        ip: accessPoint(req),
        subject: clean(opts.subject, SUBJECT_MAX),
        action: clean(opts.action, ACTION_MAX),
      },
    });
  } catch {
    /* 기록에 실패해도 관리자 업무는 계속된다. 위 주석 참고. */
  }
}
