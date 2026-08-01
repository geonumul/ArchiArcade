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
  return sendCode(to, "ARCHI ARCADE 학교 인증 코드", [
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
  return sendCode(to, "ARCHI ARCADE 비밀번호 재설정 코드", [
    `재설정 코드: ${code}`,
    "",
    `계정: ${name}`,
    "코드는 10분 뒤 만료됩니다.",
    "",
    "본인이 요청하지 않았다면 비밀번호는 그대로 두시고 이 메일을 무시하세요.",
  ].join("\n"), code);
}

/**
 * 스폰서·제휴 문의를 운영자에게 넘긴다.
 *
 * 코드 메일과 달리 받는 사람이 운영자 한 명이고 만료도 없다. 대신 회신 주소를
 * 문의한 쪽으로 걸어 둔다 - 받은 메일에서 그냥 답장을 누르면 상대에게 가야지,
 * 주소를 옮겨 적게 만들면 그 사이에 답장이 늦어진다.
 *
 * 문의는 이 함수가 불리기 전에 이미 DB 에 저장돼 있다. 그래서 여기서 실패해도
 * 던지지 않고 false 만 돌려준다 - 발송 실패 때문에 화면에 오류를 띄우면, 정작
 * 접수는 됐는데 사용자는 안 됐다고 알고 같은 문의를 또 보내게 된다.
 */
export async function sendSponsorInquiry(
  to: string,
  inquiry: { org: string; contact: string; email: string; kind: string; message: string }
): Promise<boolean> {
  return deliver(
    to,
    `[ARCHI ARCADE] 스폰서 문의 — ${inquiry.org}`,
    [
      `회사·기관: ${inquiry.org}`,
      `담당자: ${inquiry.contact || "(미기재)"}`,
      `회신 주소: ${inquiry.email}`,
      `관심: ${inquiry.kind}`,
      "",
      inquiry.message,
      "",
      "— 이 메일에 그대로 답장하면 문의한 쪽으로 갑니다.",
    ].join("\n"),
    inquiry.email
  );
}

/// 코드 메일. 키가 없으면 보내지 않고 코드를 로그로 흘려 개발 중에도 흐름을 끝까지 볼 수 있게 한다.
async function sendCode(to: string, subject: string, text: string, code: string): Promise<MailResult> {
  if (!API_KEY) {
    console.log(`[mailer] 발송 비활성 — to=${to} code=${code}`);
    return { sent: false, devCode: code };
  }
  return { sent: await deliver(to, subject, text) };
}

async function deliver(to: string, subject: string, text: string, replyTo?: string): Promise<boolean> {
  if (!API_KEY) {
    console.log(`[mailer] 발송 비활성 — to=${to} subject=${subject}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      console.error(`[mailer] 발송 실패 ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mailer] 발송 오류", e);
    return false;
  }
}
