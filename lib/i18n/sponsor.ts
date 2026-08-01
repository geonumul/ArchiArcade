/**
 * 스폰서·제휴 문의 페이지 문구.
 *
 * 학교 페이지(school.ts)와 같은 이유로 사전을 따로 둔다 — 원본 SPA 의 사전은 154문항
 * 정렬 검사와 얽혀 있어 건드리지 않는다.
 *
 * 9개 언어를 다 두지 않고 한국어·영어만 둔다. 이 페이지를 읽는 사람은 학생이 아니라
 * 예산을 집행하는 쪽이고, 당장 그 수요는 국내와 영어권에서 온다. 나머지 일곱 언어는
 * 문의가 실제로 그 언어권에서 들어오기 시작할 때 늘린다 - 번역해 두고 아무도 안 읽는
 * 문구를 아홉 벌 관리하는 것이 더 비싸다.
 */

export const SPONSOR_LANGS = ["ko", "en"] as const;
export type SponsorLang = (typeof SPONSOR_LANGS)[number];

/**
 * 허브에서 넘어오는 `?lang=` 은 아홉 가지다. 여기 없는 언어는 영어로 받는다 —
 * 일본어로 놀다 넘어온 사람에게 한국어를 들이미는 것보다 낫다.
 *
 * 값이 아예 없을 때만 한국어다. 오락실의 기본 언어가 한국어이고, `?lang=` 없이
 * 들어오는 경로는 푸터 링크(주로 국내)이기 때문이다. "en 이 아니면 ko" 가 아니라
 * "없으면 ko, 있으면 ko 아닌 건 전부 en" 이다.
 */
export function toSponsorLang(v: unknown): SponsorLang {
  if (v === null || v === undefined || v === "") return "ko";
  return v === "ko" ? "ko" : "en";
}

/// 문의 종류. 수익 모델 네 갈래와 1:1 로 맞춰 둔다(DEV_HANDOFF.md STEP 1.5).
export const INQUIRY_KINDS = ["cartridge", "room", "job", "data", "other"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export function isInquiryKind(v: unknown): v is InquiryKind {
  return typeof v === "string" && (INQUIRY_KINDS as readonly string[]).includes(v);
}

export interface SponsorStrings {
  back: string;
  errNet: string;

  title: string;
  intro: string;

  whoTitle: string;
  who: string;

  numsTitle: string;
  nVotes: string;
  /// 지금은 화면에 그리지 않는다 — 이유는 SponsorDesk 의 주석 참고.
  nPlays: string;
  nLangs: string;
  nQuestions: string;
  numsNote: string;

  offerTitle: string;
  offers: { kind: InquiryKind; name: string; desc: string }[];

  ruleTitle: string;
  rule: string;

  formTitle: string;
  fOrg: string;
  fOrgPh: string;
  fName: string;
  fNamePh: string;
  fEmail: string;
  fEmailPh: string;
  fKind: string;
  fMsg: string;
  fMsgPh: string;
  fSend: string;
  fSending: string;
  fPrivacy: string;

  doneTitle: string;
  done: string;
  doneNote: string;
  again: string;

  eOrg: string;
  eEmail: string;
  eMsg: string;
}

export const SPONSOR_UI: Record<SponsorLang, SponsorStrings> = {
  ko: {
    back: "← 오락실로",
    errNet: "연결에 실패했습니다. 잠시 후 다시 시도해주세요.",

    title: "스폰서 · 제휴 문의",
    intro:
      "설계실 오락실은 밤새우는 건축학도가 모이는 곳입니다. 이 화면은 " +
      "그 앞에 서고 싶은 회사·학교·단체를 위한 창구입니다.",

    whoTitle: "여기 오는 사람들",
    who:
      "건축학과 학생과 갓 졸업한 실무 1~3년차가 대부분입니다. 새벽에 모형을 자르다가, " +
      "크리틱 전날 밤에, 스튜디오 책상에서 켭니다. 학교 메일로 인증한 재학생 뱃지가 있어 " +
      "누가 진짜 학생인지 구분됩니다. 9개 언어로 돌아가 국내에만 갇혀 있지 않습니다.",

    numsTitle: "지금까지",
    nVotes: "누적 투표",
    nPlays: "누적 플레이",
    nLangs: "지원 언어",
    nQuestions: "문항",
    numsNote:
      "월 방문자 수·유입 경로·기기 비율 같은 상세 지표는 문의 주시면 자료로 보내드립니다. " +
      "여기 적힌 숫자는 실제 집계값이며 손대지 않습니다.",

    offerTitle: "이런 자리가 있습니다",
    offers: [
      {
        kind: "cartridge",
        name: "스폰서 카트리지",
        desc: "오락실 화면 안에 카트리지 한 칸으로 들어갑니다. 배너가 아니라 게임기의 일부로 보이게 만듭니다.",
      },
      {
        kind: "room",
        name: "조직 전용 방",
        desc: "학교 OT·회사 워크숍용 방. 로고를 걸고 문항을 직접 만들어 넣을 수 있으며, 끝나면 참여자 통계 리포트가 나옵니다.",
      },
      {
        kind: "job",
        name: "채용 공고",
        desc: "설계사무소·시공사 채용을 학생들이 보는 자리에 올립니다.",
      },
      {
        kind: "data",
        name: "데이터 · 리포트",
        desc: "국가별 건축학도 인식 비교. 9개 언어권에서 같은 문항에 어떻게 갈렸는지를 집계한 자료입니다.",
      },
      {
        kind: "other",
        name: "그 밖의 제안",
        desc: "위에 없는 형태여도 괜찮습니다. 하고 싶은 것을 적어주세요.",
      },
    ],

    ruleTitle: "지키는 선",
    rule:
      "학생 개인에게는 영원히 무료이고, 개인 플레이 화면에는 광고를 붙이지 않습니다. " +
      "추적 스크립트도 심지 않습니다. 스폰서 자리는 조직 방과 지정된 카트리지 칸에만 " +
      "들어갑니다. 이 원칙이 깨지면 사람들이 안 오고, 사람이 없으면 스폰서 자리도 값이 " +
      "없어집니다. 광고주를 위해서도 지켜야 하는 선입니다.",

    formTitle: "문의하기",
    fOrg: "회사 · 기관",
    fOrgPh: "○○건축사사무소",
    fName: "담당자",
    fNamePh: "성함",
    fEmail: "회신받을 메일",
    fEmailPh: "you@company.com",
    fKind: "관심 있는 것",
    fMsg: "하고 싶은 말",
    fMsgPh: "생각하고 계신 것, 시기, 예산 범위 — 편하게 적어주세요.",
    fSend: "보내기",
    fSending: "보내는 중...",
    fPrivacy:
      "적어주신 내용은 이 문의에 답하는 데만 씁니다. 다른 곳에 넘기지 않고, 답이 끝나면 지웁니다.",

    doneTitle: "받았습니다",
    done: "문의가 전달됐습니다.",
    doneNote: "적어주신 주소로 회신드립니다. 보통 2~3일 안에 답합니다.",
    again: "하나 더 보내기",

    eOrg: "회사 · 기관 이름을 적어주세요.",
    eEmail: "회신받을 메일 주소를 확인해주세요.",
    eMsg: "하고 싶은 말을 조금만 더 적어주세요.",
  },

  en: {
    back: "← Back to the arcade",
    errNet: "Connection failed. Please try again in a moment.",

    title: "Sponsorship & Partnership",
    intro:
      "ARCHI ARCADE is where architecture students go when they are up all night. " +
      "This page is the desk for companies, schools and societies that want to stand in front of them.",

    whoTitle: "Who shows up here",
    who:
      "Mostly architecture students, plus people one to three years into practice. They open it " +
      "while cutting models at 3am, the night before a crit, at a studio desk. Enrolled students " +
      "carry a badge verified through their university email, so real students are distinguishable. " +
      "It runs in 9 languages, so the audience is not one country.",

    numsTitle: "So far",
    nVotes: "VOTES CAST",
    nPlays: "PLAYS",
    nLangs: "LANGUAGES",
    nQuestions: "QUESTIONS",
    numsNote:
      "Monthly visitors, traffic sources and device split are sent as a media kit on request. " +
      "The figures above are live counts and are not adjusted.",

    offerTitle: "What is available",
    offers: [
      {
        kind: "cartridge",
        name: "Sponsor cartridge",
        desc: "A cartridge slot inside the arcade screen. Not a banner — it is drawn as part of the machine.",
      },
      {
        kind: "room",
        name: "Private room for your organisation",
        desc: "For orientation weeks and studio workshops. Put your logo on it, write your own questions, and get a participation report when it ends.",
      },
      {
        kind: "job",
        name: "Job postings",
        desc: "Put practice and contractor openings where the students already are.",
      },
      {
        kind: "data",
        name: "Data & reports",
        desc: "How architecture students answer the same questions across 9 language regions, compiled by country.",
      },
      {
        kind: "other",
        name: "Something else",
        desc: "If it is not on this list, describe it anyway.",
      },
    ],

    ruleTitle: "The line we hold",
    rule:
      "It stays free for individual students forever, and no ads appear on personal play screens. " +
      "No tracking scripts either. Sponsor placements live only in organisation rooms and the " +
      "designated cartridge slot. If that line breaks, people stop coming — and with no audience " +
      "the placement is worth nothing. This is a line worth holding for the advertiser too.",

    formTitle: "Get in touch",
    fOrg: "Company / organisation",
    fOrgPh: "Your practice or school",
    fName: "Contact",
    fNamePh: "Your name",
    fEmail: "Reply-to email",
    fEmailPh: "you@company.com",
    fKind: "What interests you",
    fMsg: "Tell us more",
    fMsgPh: "What you have in mind, timing, rough budget — however you like.",
    fSend: "Send",
    fSending: "Sending...",
    fPrivacy:
      "What you write is used only to answer this enquiry. It is not passed on, and it is deleted once the conversation ends.",

    doneTitle: "Received",
    done: "Your enquiry has been sent.",
    doneNote: "We will reply to the address you gave, usually within two or three days.",
    again: "Send another",

    eOrg: "Please give a company or organisation name.",
    eEmail: "Please check the reply-to email address.",
    eMsg: "Please write a little more.",
  },
};
