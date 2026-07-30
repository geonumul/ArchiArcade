/**
 * 메일 발송.
 *
 * RESEND_API_KEY 가 없으면 실제로 보내지 않고 서버 로그에 남긴다. AI 검열과 같은
 * 방식이다 — 키가 없어도 기능 전체가 동작하고, 키를 넣는 순간 실제 발송으로 바뀐다.
 * 덕분에 계정을 만들기 전에도 인증 흐름을 끝까지 테스트할 수 있다.
 */
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "ARCHI ARCADE <onboarding@resend.dev>";

export const MAIL_ENABLED = Boolean(API_KEY);

export interface MailResult {
  sent: boolean;
  /**
   * 발송이 꺼져 있을 때만 채워진다. 개발 중 코드를 확인하는 용도다.
   *
   * 이 값을 응답에 실을지는 호출하는 쪽이 판단한다 — /api/verify/request 는
   * 로컬 개발에서만 내보내고, 프로덕션에서는 메일을 못 보내면 인증 자체를 닫는다.
   * 여기서 채워졌다는 것만으로 안전하다고 보면 안 된다.
   */
  devCode?: string;
}

export async function sendVerificationCode(to: string, code: string, schoolName: string): Promise<MailResult> {
  return send(to, "ARCHI ARCADE 학교 인증 코드", [
    `인증 코드: ${code}`,
    "",
    `${schoolName} 소속으로 인증합니다.`,
    "코드는 10분 뒤 만료됩니다.",
    "",
    "본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.",
  ].join("\n"), code);
}

/// 비밀번호 재설정 코드. 계정 이름을 함께 적어, 남의 계정 메일을 받았을 때 알아챌 수 있게 한다.
export async function sendPasswordResetCode(to: string, code: string, name: string): Promise<MailResult> {
  return send(to, "ARCHI ARCADE 비밀번호 재설정 코드", [
    `재설정 코드: ${code}`,
    "",
    `계정: ${name}`,
    "코드는 10분 뒤 만료됩니다.",
    "",
    "본인이 요청하지 않았다면 비밀번호는 그대로 두시고 이 메일을 무시하세요.",
  ].join("\n"), code);
}

async function send(to: string, subject: string, text: string, code: string): Promise<MailResult> {
  if (!API_KEY) {
    console.log(`[mailer] 발송 비활성 — to=${to} code=${code}`);
    return { sent: false, devCode: code };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    if (!res.ok) {
      console.error(`[mailer] 발송 실패 ${res.status}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error("[mailer] 발송 오류", e);
    return { sent: false };
  }
}
