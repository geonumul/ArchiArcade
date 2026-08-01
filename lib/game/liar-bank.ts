import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 제시어 은행 읽기.
 *
 * 은행은 화면이 쓰는 public/liar-words.js 하나뿐이다. 서버용 사본을 따로 두면 언젠가
 * 한쪽만 고쳐져서, 서버가 낸 제시어와 화면이 보여 주는 단어가 어긋난다. 그때는 아무도
 * 무엇이 틀렸는지 모른 채 게임만 이상해진다.
 *
 * 서버가 은행을 읽어야 하는 이유는 하나다. 라이어를 정하고 가짜 단어를 골라 주는 일을
 * 브라우저에 맡길 수 없기 때문이다.
 *
 * public/ 은 정적 자산으로만 배포되고 함수 번들에는 들어가지 않는다. fs 로 읽으므로
 * 추적도 되지 않아, next.config.mjs 의 outputFileTracingIncludes 에 적어 두지 않으면
 * 로컬에서는 되고 배포하면 제시어를 못 불러온다.
 */

export interface LiarWord {
  /// 진짜 제시어.
  w: string;
  /// 라이어가 받는 가짜.
  f: string;
  /// 분류. 모두에게 보여 이야기의 틀을 잡아 준다.
  c: string;
  /// 진짜 단어 설명. 반쯤 아는 사람도 말을 뗄 수 있게 한 줄.
  d?: string;
  /// 가짜 단어 설명.
  df?: string;
  /// 게임이 채팅에 먼저 던지는 질문. 진짜와 가짜 둘 다에 맞아야 한다.
  m?: string;
}

type Bank = Record<string, LiarWord[]>;

let cached: Bank | null | undefined;

export function liarBank(): Bank | null {
  if (cached !== undefined) return cached;
  try {
    const src = readFileSync(join(process.cwd(), "public", "liar-words.js"), "utf8");
    const g: { LIARWORDS?: Bank } = {};
    // 은행 파일은 window 에 대입하는 스크립트다. 그대로 실행해 값을 꺼낸다.
    new Function("window", src)(g);
    cached = g.LIARWORDS ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/// 그 언어의 목록. 없는 언어는 한국어로 떨어진다 - 판이 안 열리는 것보다 낫다.
export function liarWords(bank: Bank, lang: string): LiarWord[] {
  return bank[lang]?.length ? bank[lang] : (bank.ko ?? []);
}
