import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 유입 채널별 퍼널 집계.
 *
 * 어느 채널로 들어온 사람이 실제로 한 판 놀고, 가입하고, 학교 인증까지 가는지를 알아야
 * 홍보를 어디에 붙일지 정할 수 있다. 방문 수만 보면 링크를 많이 뿌린 쪽이 늘 이겨서
 * 판단이 어긋난다.
 *
 * 대신 사람을 알아볼 수 있는 것은 하나도 남기지 않는다. IP 도 쿠키도 저장하지 않고
 * 남는 것은 (날짜, 채널, 기기, 언어) 칸의 숫자뿐이라, 행 하나가 언제나 여러 사람의
 * 합이다. IP 는 아래에서 레이트리밋 키를 만드는 데만 잠깐 쓰고 어디에도 쓰지 않는다.
 *
 *   POST /api/visits { event, channel, device, lang } → { ok: true }
 */

/// 알아볼 수 있는 채널만 센다. 유입 파라미터는 아무 값이나 들어올 수 있어서
/// 걸러 두지 않으면 칸이 무한히 늘어나고 표가 읽을 수 없게 된다.
const CHANNELS = ["kakao", "instagram", "google", "naver", "direct", "other"] as const;
const DEVICES = ["mobile", "desktop"] as const;

/// 화면이 보내는 사건 이름과 표의 칸 이름을 여기서만 잇는다. 목록에 없는 이름은
/// 아래에서 400 으로 막으므로 사건 이름이 그대로 칸 이름이 되는 일은 없다.
const COUNTERS = {
  visit: "visits",
  play: "plays",
  signup: "signups",
  verify: "verifies",
} as const;

type Counter = (typeof COUNTERS)[keyof typeof COUNTERS];

export async function POST(req: Request) {
  // DB 가 없는 환경(로컬 개발)에서도 화면은 그대로 돌아가야 한다. 집계는 있으면 좋은
  // 숫자일 뿐이라 여기서 실패를 알리면 얻는 것 없이 페이지만 시끄러워진다.
  if (!hasDatabase || !prisma) return NextResponse.json({ ok: true });

  let body: { event?: unknown; channel?: unknown; device?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const counter: Counter | undefined = COUNTERS[String(body.event) as keyof typeof COUNTERS];
  if (!counter) return NextResponse.json({ error: "알 수 없는 사건" }, { status: 400 });

  // 채널과 기기는 모르면 버리지 않고 가장 무난한 칸으로 넣는다. 버리면 합계가
  // 방문 수와 어긋나서 퍼널 비율 자체를 믿을 수 없게 된다.
  const channel = (CHANNELS as readonly string[]).includes(String(body.channel))
    ? String(body.channel)
    : "other";
  const device = (DEVICES as readonly string[]).includes(String(body.device))
    ? String(body.device)
    : "desktop";
  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 한 사람이 앉은 자리에서 방문 한 번에 여러 판을 돌리고 가입까지 하는 흐름이
  // 정상이라 넉넉하게 잡는다. 좁게 잡으면 막히는 쪽은 늘 제일 열심히 논 사람이고,
  // 그러면 퍼널 뒷단(가입, 인증)만 골라서 깎여 나간다. 학교나 카페처럼 여러 명이
  // 같은 IP 를 쓰는 경우도 있어서 더 그렇다.
  const rl = await rateLimit(`visits:${ipKey(ip)}`, 300, 600);
  // 막혔어도 화면에는 아무 일도 없어야 한다. 이 요청은 사용자가 볼 응답이 아니다.
  if (!rl.allowed) return NextResponse.json({ ok: true });

  const day = new Date().toISOString().slice(0, 10);

  /* 증가는 반드시 한 문장이어야 한다. 값을 읽어 1을 더해 되쓰는 식으로 했다가
     동시에 들어온 요청끼리 서로의 증가분을 덮어써서 숫자가 사라진 적이 있다
     (/api/stats 주석 참고). upsert 의 increment 는 DB 가 한 번에 처리하므로
     같은 칸에 몇 명이 몰려도 겹쳐 사라지지 않는다. */
  await prisma.visitStat
    .upsert({
      where: { day_channel_device_lang: { day, channel, device, lang } },
      create: { day, channel, device, lang, [counter]: 1 },
      update: { [counter]: { increment: 1 } },
    })
    .catch(() => null); // 집계가 실패해도 화면은 계속 돌아야 한다.

  return NextResponse.json({ ok: true });
}
