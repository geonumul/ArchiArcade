import type { Metadata } from "next";
import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "ARCHI ARCADE 가 어떤 정보를 왜 받고 얼마나 두는지.",
};

/**
 * 개인정보 처리방침.
 *
 * 개인정보 보호법 제30조는 처리 목적·보유 기간·제3자 제공·파기 절차를 담은 방침을
 * 정하고 공개하도록 한다. 동의를 받았는지와 무관하게 지는 의무라 페이지로 둔다.
 *
 * 수집 자체는 같은 법 제15조제1항제4호(계약 이행에 필요한 경우)에 기대고 있다.
 * 이메일은 비밀번호를 되돌리는 유일한 수단이고 학교 메일은 본인이 인증을 요청해야
 * 받는 것이라, 서비스를 하려면 없을 수 없는 항목들이다. 그래서 별도 동의 절차를
 * 두지 않았다 - 동의는 다섯 가지 근거 중 하나일 뿐이다.
 *
 * 방문 통계에는 개인을 가리키는 값이 없어(IP·쿠키·기기 식별자를 저장하지 않는다)
 * 여기 적을 대상이 아니지만, 무엇을 세는지 밝혀 두는 편이 낫다고 보아 함께 적는다.
 */

const UPDATED = "2026년 7월 30일";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ textAlign: "left" }}>
      <label>{title}</label>
      <div className="note" style={{ textAlign: "left", lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <Cabinet title="개인정보 처리방침" hudRight="PRIVACY">
      <div className="note">시행일 {UPDATED}</div>

      <Section title="1. 무엇을 받나">
        <b>회원가입</b> - 닉네임, 이메일, 비밀번호
        <br />
        비밀번호는 되돌릴 수 없는 형태(argon2id)로 바꿔 저장하며 원문은 보관하지 않습니다.
        <br />
        <br />
        <b>학교 인증(선택)</b> - 학교 이메일, 학교, 학과
        <br />
        <br />
        <b>동문 목록(선택)</b> - 표시할 이름, 재학/졸업, 졸업연도, 회사·소속
        <br />
        본인이 공개를 켤 때만 저장하고, 끄면 목록에서 빠집니다.
        <br />
        <br />
        <b>게임 기록</b> - 플레이 횟수, 소수의견 수, 어떤 문항에 무엇을 골랐는지
        <br />
        <br />
        받지 않는 것 - 이름, 생년월일, 전화번호, 주소, 결제정보, 주민등록번호
      </Section>

      <Section title="2. 왜 받나">
        이메일은 <b>비밀번호를 잊었을 때 되돌리는 유일한 수단</b>입니다. 이것이 없으면
        계정을 복구할 방법이 없습니다.
        <br />
        학교 정보는 학교별 순위와 동문 목록을 위한 것이고, 본인이 인증을 요청할 때만 받습니다.
        <br />
        게임 기록은 전적·칭호와 전세계 통계 집계에 씁니다.
      </Section>

      <Section title="3. 얼마나 두나">
        계정 정보는 <b>탈퇴할 때까지</b> 둡니다.
        <br />
        인증 코드와 비밀번호 재설정 코드는 <b>10분</b> 뒤 만료되며 사용 즉시 지웁니다.
        <br />
        방 정보(참가자 닉네임, 표)는 <b>24시간</b> 뒤 자동으로 지워집니다.
        <br />
        투표 집계는 개인과 연결되지 않는 숫자로만 남습니다.
      </Section>

      <Section title="4. 남에게 주나">
        <b>팔지 않고, 넘기지 않습니다.</b> 다음은 서비스를 굴리기 위해 거치는 곳입니다.
        <br />
        · Vercel - 사이트 운영
        <br />
        · Neon - 데이터베이스 보관
        <br />
        · Resend - 인증 메일 발송(받는 주소만 전달)
        <br />
        · Upstash - 도배 방지 카운터(개인정보 저장 안 함)
        <br />
        · Anthropic - 게시글 검열(글 내용만 전달, 작성자 정보 없음)
      </Section>

      <Section title="5. 어떻게 지우나">
        <b>동문 목록</b> - 공개 설정을 끄면 즉시 빠집니다.
        <br />
        <b>학교 인증</b> - 뱃지 해제를 누르면 인증 기록까지 지워집니다.
        <br />
        <b>제보</b> - 본인이 넣은 것은 본인이 지울 수 있습니다.
        <br />
        <b>계정 전체</b> - 아래 주소로 알려주시면 지웁니다.
        <br />
        보유 기간이 지난 것은 별도 요청 없이 자동으로 지워집니다.
      </Section>

      <Section title="6. 방문 통계">
        어느 경로로 들어오는지 보려고 <b>날짜 · 유입경로 · 기기종류 · 언어</b> 조합의
        숫자만 셉니다.
        <br />
        <b>IP 주소를 저장하지 않고</b>, 방문자를 구분하는 쿠키나 기기 식별자도 심지
        않습니다. 어떤 기록도 특정한 사람을 가리키지 않아 개인정보에 해당하지 않습니다.
      </Section>

      <Section title="7. 안전하게 두나">
        비밀번호는 argon2id 로 바꿔 저장하고, 로그인 정보는 스크립트가 읽을 수 없는
        쿠키(httpOnly)에 담습니다. 통신은 전부 HTTPS 입니다.
      </Section>

      <Section title="8. 문의">
        개인정보 보호책임자 - ARCHI ARCADE 운영자
        <br />
        문의 - <b>8268ko@gmail.com</b>
        <br />
        <br />
        이 방침이 바뀌면 이 페이지에 시행일과 함께 알립니다.
      </Section>

      <Link className="btn kr gray" href="/">
        ← 오락실로
      </Link>
    </Cabinet>
  );
}
