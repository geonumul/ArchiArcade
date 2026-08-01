import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "@/lib/db";
import { rateLimit, ipKey } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 한 판이 어떻게 끝났는지에 대한 집계.
 *
 * 방문 수와 플레이 수만으로는 "재미없어서 나갔다" 가 보이지 않는다. 시작한 판 중 몇
 * 개가 끝까지 갔는지, 평균 몇 문항에서 멈추는지를 알아야 어느 문항을 손볼지 정할 수
 * 있다. 어느 언어권에서 유독 중간에 나가는지도 같이 본다.
 *
 * 개인과 이어지지 않는다. 누가 했는지는 넣지 않고 그날의 합만 올린다. 그래서 이 표는
 * 개인정보가 아니고(개인정보 보호법 제58조의2), 목적을 좁게 적을 필요도 보관 기간을
 * 정할 이유도 없다. 목적을 꾸며서 개인 단위 기록을 늘리는 것보다, 개인과의 연결을
 * 끊고 마음껏 세는 쪽이 얻는 것도 많고 탈도 없다.
 *
 *   POST /api/rounds { game, event, lang, answered? }
 *     event: "start" | "finish"
 *   GET  /api/rounds?days=14   관리자만. 완주율과 평균 문항 수
 */

const GAMES = ["balance", "archq"] as const;
const EVENTS = { start: "started", finish: "finished" } as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/// 나라는 Vercel 이 헤더에 붙여 준다. 두 글자 밖은 받지 않는다 - 도시나 좌표는
/// 애초에 받을 생각이 없고, 두 글자면 언어권을 보기에 충분하다.
///
///
/// 나라를 모르면 아예 세지 않는다. 배포 경계를 지나면 이 헤더는 늘 붙으므로, 없는
/// 요청은 사실상 로컬에서 부른 것뿐이다. 예전에는 ZZ 로 모아 두었는데 그 줄은 아무
/// 것도 말해 주지 않으면서 화면에서 자리만 차지했고, 자동 검사가 돌 때마다 늘었다.
function countryOf(req: Request): string | null {
  const raw = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "";
  return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
}

export async function POST(req: Request) {
  if (!hasDatabase || !prisma) return NextResponse.json({ ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // 한 판에 두 번(시작·완료) 올라오므로 넉넉히 둔다. 여기서 막히면 통계에 구멍이 난다.
  const rl = await rateLimit(`rounds:${ipKey(ip)}`, 120, 600);
  if (!rl.allowed) return NextResponse.json({ ok: true });

  let body: { game?: unknown; event?: unknown; lang?: unknown; answered?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const game = (GAMES as readonly string[]).includes(String(body.game)) ? String(body.game) : null;
  const column = EVENTS[String(body.event) as keyof typeof EVENTS];
  if (!game || !column) return NextResponse.json({ error: "잘못된 값" }, { status: 400 });

  const lang = typeof body.lang === "string" && isLang(body.lang) ? body.lang : "ko";
  const device = /Mobi|Android|iPhone|iPad/i.test(req.headers.get("user-agent") ?? "") ? "mobile" : "desktop";
  const answered = Math.max(0, Math.min(200, Number(body.answered) || 0));

  const country = countryOf(req);
  // 나라를 모르는 요청은 집계하지 않는다. 위 주석 참고.
  if (!country) return NextResponse.json({ ok: true });

  const where = { day: today(), game, device, lang, country };

  /* 한 문장으로 올린다. 읽고-더하고-쓰기를 하면 동시에 끝난 두 판 중 하나가 사라진다.
     실제로 다른 키에서 그렇게 잃은 적이 있어서, 세는 것은 전부 이 방식으로 통일했다. */
  await prisma.roundStat
    .upsert({
      where: { day_game_device_lang_country: where },
      create: { ...where, [column]: 1, answered },
      update: { [column]: { increment: 1 }, answered: { increment: answered } },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (!hasDatabase || !prisma) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  // 관리자 판별은 다른 관리자 화면과 같은 방식이다. 권한이 없으면 있는 줄도 모르게 404.
  const { cookies } = await import("next/headers");
  const { readToken, isAdminName, ACCESS_COOKIE } = await import("@/lib/auth");
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims || !isAdminName(claims.name)) {
    return NextResponse.json({ error: "권한이 없어요" }, { status: 404 });
  }

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14));
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

  const rows = await prisma.roundStat.groupBy({
    by: ["game", "lang", "country"],
    where: { day: { gte: from } },
    _sum: { started: true, finished: true, answered: true },
  });

  return NextResponse.json({
    from,
    rows: rows
      .map((r) => {
        const started = r._sum.started ?? 0;
        const finished = r._sum.finished ?? 0;
        return {
          game: r.game,
          lang: r.lang,
          country: r.country,
          started,
          finished,
          /// 완주율과 평균 문항 수. 시작이 0이면 나눌 것이 없으므로 0으로 둔다.
          rate: started ? Math.round((finished / started) * 100) : 0,
          avgAnswered: started ? Math.round(((r._sum.answered ?? 0) / started) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.started - a.started),
  });
}
