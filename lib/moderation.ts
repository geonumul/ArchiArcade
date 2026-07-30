/**
 * 콘텐츠 검열 — 2단 구성.
 *
 *  1) 룰베이스 (항상 동작, 키 불필요)
 *  2) AI 문맥 판정 (ANTHROPIC_API_KEY 가 설정되고 MODERATION_AI=on 일 때만)
 *
 * 지금은 키가 없으므로 1)만 돈다. 2)는 자리만 만들어 두고 완전히 비활성이며,
 * 키를 넣는 순간 켜진다 — 프론트에서 API 키를 직접 호출하지 않고 반드시 이 서버
 * 모듈을 경유한다(원본 index.html 은 브라우저에서 api.anthropic.com 을 직접 불렀다).
 *
 * 판정 철학은 원본 프롬프트를 그대로 계승한다. 은어·게임 농담·문항에 대한 혹평은
 * 전부 통과시키고, 아래 다섯 가지만 차단한다:
 *   혐오/인종차별 · 괴롭힘/협박 · 성적 콘텐츠 · 범죄 조장 · 신상 노출
 * 따라서 룰베이스는 "확실한 신호"에만 반응하도록 보수적으로 짰다. 애매하면 통과다.
 */
import crypto from "node:crypto";

export type ModerationEngine = "rules" | "ai";

export interface ModerationResult {
  ok: boolean;
  /// 차단 사유(짧게). 통과면 빈 문자열.
  reason: string;
  engine: ModerationEngine;
  /// 감사 로그용 — 원문은 저장하지 않는다.
  bodyHash: string;
}

export const AI_ENABLED =
  process.env.MODERATION_AI === "on" && Boolean(process.env.ANTHROPIC_API_KEY);

// ── 정규화 ──────────────────────────────────────────────────
// 우회(ㅅ ㅂ, s.h.i.t, 0 대신 o 등)를 막기 위해 비교 전에 형태를 납작하게 만든다.
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0134579@$]/g, (c) => LEET[c] ?? c)
    .replace(/[\s._\-*+~^|/\\]+/g, "");
}

// ── 신상 노출(PII) — 언어 무관, 오탐이 거의 없는 고신뢰 신호 ──
const PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "주민등록번호", re: /\b\d{6}\s*[-–]\s*[1-4]\d{6}\b/ },
  { name: "전화번호", re: /\b(?:\+?\d{1,3}[\s-]?)?01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}\b/ },
  { name: "카드번호", re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/ },
  { name: "이메일", re: /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i },
  { name: "계좌번호", re: /\b\d{2,3}-\d{2,6}-\d{2,6}\b/ },
];

// ── 차단 어휘 ────────────────────────────────────────────────
// 의도적으로 짧게 유지한다. 목록이 길수록 오탐이 늘고, 문맥 판단은 AI 단계의 몫이다.
// 운영하면서 신고 데이터를 근거로만 확장할 것.
const BLOCK_TERMS: { category: string; terms: string[] }[] = [
  {
    category: "협박",
    terms: ["죽여버린다", "죽여버릴", "칼로찌른", "칼들고", "패죽인", "killyou", "iwillkillyou", "殺してやる", "弄死你"],
  },
  {
    category: "성적",
    terms: ["몰카", "야동", "성매매", "조건만남", "porn", "sextape", "エロ動画", "援交"],
  },
  {
    category: "범죄조장",
    terms: ["대리시험", "시험지유출", "논문대필", "마약삽니다", "필로폰", "buydrugs", "代写论文", "替え玉受験"],
  },
];

// 도배: 같은 문자가 과도하게 반복되거나 내용 없이 길기만 한 경우
const FLOOD_RE = /(.)\1{19,}/;

export interface ModerationInput {
  text: string;
  lang?: string;
}

function hashOf(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/// 룰베이스 판정. 확실한 신호에만 반응하고, 나머지는 전부 통과시킨다.
export function moderateByRules({ text }: ModerationInput): ModerationResult {
  const bodyHash = hashOf(text);
  const base: Omit<ModerationResult, "ok" | "reason"> = { engine: "rules", bodyHash };

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "내용이 비어 있어요", ...base };

  for (const { name, re } of PII_PATTERNS) {
    if (re.test(trimmed)) return { ok: false, reason: `${name}로 보이는 정보가 있어요`, ...base };
  }

  if (FLOOD_RE.test(trimmed)) return { ok: false, reason: "같은 문자가 반복돼요", ...base };

  const flat = normalize(trimmed);
  for (const { category, terms } of BLOCK_TERMS) {
    for (const term of terms) {
      if (flat.includes(normalize(term))) {
        return { ok: false, reason: `${category} 표현이 포함돼 있어요`, ...base };
      }
    }
  }

  return { ok: true, reason: "", ...base };
}

/// AI 문맥 판정. 키가 없으면 호출 자체를 하지 않는다.
/// 판정 불가(네트워크/타임아웃/파싱 실패) 시에는 통과시킨다 — 룰베이스가 이미 한 번 걸렀고,
/// 오탐으로 정상 글을 막는 쪽이 더 큰 손해라는 원본 정책을 유지한다.
async function moderateByAI({ text, lang }: ModerationInput, bodyHash: string): Promise<ModerationResult> {
  const pass: ModerationResult = { ok: true, reason: "", engine: "ai", bodyHash };
  if (!AI_ENABLED) return pass;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODERATION_MODEL || "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content:
              "You moderate a global architecture-student community board. Judge CONTEXT, not keywords: slang, game banter, harsh critique of quiz questions, and architecture jokes are all FINE. Block only: hate/racism, harassment or threats, sexual content, praising or facilitating crime, doxxing/personal info. " +
              `Text language hint: ${lang ?? "unknown"}. ` +
              'Reply ONLY minified JSON, no markdown: {"ok":true} or {"ok":false,"reason":"<max 8 words, in the text language>"}\n\nTEXT: ' +
              text,
          },
        ],
      }),
    });
    if (!res.ok) return pass;
    const data: unknown = await res.json();
    const blocks = (data as { content?: { type: string; text?: string }[] }).content ?? [];
    const raw = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const verdict = JSON.parse(raw) as { ok?: boolean; reason?: string };
    return { ok: Boolean(verdict.ok), reason: verdict.reason ?? "", engine: "ai", bodyHash };
  } catch {
    return pass;
  } finally {
    clearTimeout(timer);
  }
}

/// 최종 판정: 룰베이스로 먼저 거르고, 통과한 것만 AI 에 넘긴다(키가 있을 때).
export async function moderate(input: ModerationInput): Promise<ModerationResult> {
  const rules = moderateByRules(input);
  if (!rules.ok) return rules;
  if (!AI_ENABLED) return rules;
  return moderateByAI(input, rules.bodyHash);
}
