import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, prisma } from "@/lib/db";
import { readToken, ACCESS_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { moderate } from "@/lib/moderation";
import { isLang } from "@/lib/i18n";
import { ROOM_TTL_MS } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대기실 채팅.
 *
 * 방과 같은 저장소에 두되 쓰기는 여기서만 한다. 브라우저에 쓰기를 열어 두면 로그인
 * 없이 아무 이름으로 넣거나 대화를 통째로 덮어쓸 수 있는데, 게시판에서 실제로
 * 그럴 수 있었다. 읽기는 열려 있어 화면이 방 폴링에 얹어 가져간다.
 *
 * 말하려면 로그인해야 한다. 방 코드를 아는 사람은 누구나 들어올 수 있으므로,
 * 이름을 마음대로 쓸 수 있으면 남을 사칭하기가 너무 쉽다.
 */

const TEXT_MAX = 80;
/// 대기실에서 잠깐 나누는 대화다. 길게 쌓아 둘 이유가 없고, 방 상태와 같이 24시간 뒤 사라진다.
const KEEP = 40;

/**
 * 줄바꿈이나 제어문자를 걷어낸다.
 *
 * 정규식 문자 클래스 대신 코드포인트로 거르는 이유는, 소스에 제어문자를 직접 적으면
 * 파일이 바이너리로 취급돼 편집기와 도구가 다루기 어려워지기 때문이다.
 */
function stripControl(s: string): string {
  return [...s]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 32 && c !== 127;
    })
    .join("");
}

interface Msg {
  n: string;
  t: string;
  ts: number;
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) {
    return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });
  }

  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims) {
    return NextResponse.json({ error: "로그인하면 대화할 수 있어요", needLogin: true }, { status: 401 });
  }

  let body: { code?: unknown; text?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "방 코드를 확인해주세요" }, { status: 400 });
  }

  const text = stripControl(typeof body.text === "string" ? body.text : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_MAX);
  if (!text) return NextResponse.json({ error: "내용을 적어주세요" }, { status: 400 });

  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";

  // 한 사람이 도배하지 못하게 막는다. 대기실에서 나누는 대화라 이 정도면 넉넉하다.
  const rl = await rateLimit(`chat:${claims.sub}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "조금 천천히 보내주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  // 방이 살아 있는지 본다. 없는 방에 대화만 쌓이는 것을 막는다.
  const room = await prisma.kv.findUnique({ where: { key: `abg2-${code}-st` } });
  if (!room) return NextResponse.json({ error: "그런 방이 없어요" }, { status: 404 });

  const verdict = await moderate({ text, lang });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "이 내용은 보낼 수 없어요", reason: verdict.reason, blocked: true },
      { status: 422 }
    );
  }

  const key = `abg2-${code}-chat`;
  const cur = await prisma.kv.findUnique({ where: { key } });
  let list: Msg[] = [];
  try {
    const parsed = cur ? JSON.parse(cur.value) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    /* 망가진 값이면 새로 시작한다 - 대기실 대화라 잃어도 되는 종류다 */
  }

  // 이름은 계정 이름을 쓴다. 보낸 값을 믿으면 남을 사칭할 수 있다.
  list.push({ n: claims.name, t: text, ts: Date.now() });
  const next = list.slice(-KEEP);

  const expiresAt = new Date(Date.now() + ROOM_TTL_MS);
  await prisma.kv.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next), expiresAt },
    update: { value: JSON.stringify(next), expiresAt },
  });

  return NextResponse.json({ ok: true, messages: next });
}
