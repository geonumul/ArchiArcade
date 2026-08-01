import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import { readToken, isAdminName, ACCESS_COOKIE } from "@/lib/auth";
import { logAdminAccess } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { moderate } from "@/lib/moderation";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 질문 밸런스 제보(공작소).
 *
 * 예전에는 공용 키-값 저장소에 넣어 두고 화면에 모두 보여 줬다. 그 저장소는 누구나
 * 읽을 수 있으므로, 화면에서 숨기는 것만으로는 "관리자만 보기" 가 성립하지 않는다.
 * 그래서 저장 위치를 옮기고 읽기 권한을 서버가 판단한다.
 *
 *   POST   /api/reports            로그인한 사람만. 검열을 거친다.
 *   GET    /api/reports            관리자는 전체, 그 밖에는 본인 것만.
 *   DELETE /api/reports?id=…       본인 것 또는 관리자.
 *
 * 넣은 사람이 본인 것을 볼 수 있어야 하는 이유는 하나다 — 그래야 지울 수 있다.
 */

const BODY_MAX = 300;
const NAME_MAX = 24;
const PAGE = 100;
/**
 * 원본 신고 종류 <select> 의 값. 코드가 아니라 한글 그대로인 것은 원본이 그렇게
 * 쓰기 때문이고, 여기서 바꾸면 이미 쌓인 값과 아이콘 표(TP_ICON)가 어긋난다.
 * 그 밖의 값은 받지 않는다.
 */
const KINDS = ["밸런스붕괴", "새질문", "개선"] as const;

/**
 * 게시판 둘. 규칙은 같고 누가 볼 수 있느냐만 다르다.
 *   report - 질문 밸런스 제보. 관리자와 본인만 본다.
 *   idea   - 다음 카트리지 신청. 모두가 본다.
 */
const BOARDS = ["report", "idea"] as const;
type Board = (typeof BOARDS)[number];
function asBoard(v: unknown): Board {
  return (BOARDS as readonly string[]).includes(String(v)) ? (String(v) as Board) : "report";
}

interface Me {
  id: string;
  name: string;
  admin: boolean;
}

async function whoami(): Promise<Me | null> {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  if (!claims) return null;
  return { id: claims.sub, name: claims.name, admin: isAdminName(claims.name) };
}

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function GET(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const board = asBoard(new URL(req.url).searchParams.get("board"));
  const me = await whoami();

  // 신청 목록은 누구나 본다 - 남들이 뭘 원하는지 보는 것이 이 게시판의 재미다.
  // 제보는 로그인해야 보이고, 그마저도 자기 것만 보인다.
  if (!me && board !== "idea") {
    return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });
  }

  const prisma = db();
  const rows = await prisma.report.findMany({
    where:
      board === "idea"
        ? { board }
        : // 관리자만 전체를 본다. 그 밖에는 자기가 넣은 것만 - 지우기 위해서다.
          me!.admin
          ? { board }
          : { board, userId: me!.id },
    select: { id: true, authorName: true, kind: true, body: true, lang: true, country: true, createdAt: true, userId: true },
    orderBy: { createdAt: "desc" },
    take: PAGE,
  });

  /* 관리자가 제보함을 펼치면 남이 쓴 글과 그때 적은 이름을 통째로 보게 되므로 접속기록을
     남긴다(고시 제8조). 신청 게시판(idea)은 누구나 보는 자리라 관리자라고 더 보는 것이
     없어서 남기지 않는다 - 아무 일도 아닌 줄까지 쌓이면 정작 봐야 할 줄이 묻힌다. */
  if (me?.admin && board !== "idea") {
    await logAdminAccess(req, {
      admin: me.name,
      subject: `제보 ${rows.length}건 (작성자 ${new Set(rows.map((r) => r.userId)).size}명)`,
      action: "제보함 조회",
    });
  }

  return NextResponse.json({
    board,
    admin: Boolean(me?.admin),
    loggedIn: Boolean(me),
    rows: rows.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      kind: r.kind,
      body: r.body,
      lang: r.lang,
      country: r.country,
      createdAt: r.createdAt.toISOString(),
      // 지울 수 있는지 화면이 바로 알 수 있게 함께 내보낸다.
      mine: Boolean(me) && r.userId === me!.id,
    })),
  });
}

export async function POST(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인 후 제보할 수 있어요", needLogin: true }, { status: 401 });

  const rl = await rateLimit(`report:${me.id}`, 8, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "제보가 너무 잦아요. 잠시 후 다시 시도해주세요" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let raw: { kind?: unknown; body?: unknown; lang?: unknown; authorName?: unknown; board?: unknown };
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const board = asBoard(raw.board);
  const kind = (KINDS as readonly string[]).includes(String(raw.kind)) ? String(raw.kind) : KINDS[0];
  const body = clean(raw.body, BODY_MAX);
  const lang = typeof raw.lang === "string" && isLang(raw.lang) ? raw.lang : "ko";
  // 표시 이름은 보낸 값을 쓰되, 비어 있으면 계정 이름으로 채운다.
  const authorName = clean(raw.authorName, NAME_MAX) || me.name;

  if (!body) return NextResponse.json({ error: "내용을 적어주세요", field: "body" }, { status: 400 });

  // 검열은 서버에서 한 번 더 본다. 화면에서만 걸러 두면 API 를 직접 부르면 지나간다.
  const verdict = await moderate({ text: `${authorName} | ${body}`, lang });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "이 내용은 등록하기 어려워요", reason: verdict.reason, blocked: true },
      { status: 422 }
    );
  }

  const prisma = db();
  const row = await prisma.report.create({
    data: {
      userId: me.id, board, authorName, kind, body, lang,
      /* 올린 곳의 나라. Vercel 이 헤더에 붙여 주므로 따로 물어보지 않는다.
         두 글자가 아니면 버린다 - 알 수 없는 값을 넣느니 비워 두는 편이 낫다. */
      country: (function(){
        const c = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "";
        return /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null;
      })(),
    },
    select: { id: true, authorName: true, kind: true, body: true, lang: true, country: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, report: { ...row, createdAt: row.createdAt.toISOString(), mine: true } });
}

export async function DELETE(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "지울 대상이 없어요" }, { status: 400 });

  const prisma = db();

  /* 관리자가 지우는 것이라면 누구 글이었는지 먼저 읽어 둔다. 지운 뒤에는 알아낼 방법이
     없는데, 접속기록의 "처리한 정보주체 정보"가 비면 기록으로 인정되지 않는다
     (고시 제2조제3호). 관리자가 아닐 때는 본인 것만 지워지므로 이 조회를 하지 않는다. */
  const target = me.admin
    ? await prisma.report.findUnique({ where: { id }, select: { userId: true, authorName: true } })
    : null;

  // 관리자가 아니면 본인 것만 지워진다. 조건을 where 에 넣어, 남의 것을 지우려 해도
  // "없음" 으로 떨어지게 한다 — 존재 여부조차 알려주지 않는다.
  const removed = await prisma.report.deleteMany({
    where: me.admin ? { id } : { id, userId: me.id },
  });

  if (removed.count === 0) {
    return NextResponse.json({ error: "그 제보를 찾지 못했어요" }, { status: 404 });
  }

  /* 본인 글을 지운 관리자까지 한 줄 남는다. 남의 것인지 가려서 빼면 코드는 조금
     깔끔해지지만, 빠뜨린 줄은 나중에 되살릴 수 없다. 더 남는 쪽이 안전하다. */
  if (me.admin) {
    await logAdminAccess(req, {
      admin: me.name,
      subject: `제보 ${id} (작성자 ${target?.authorName ?? "미상"} / ${target?.userId ?? "미상"})`,
      action: target && target.userId === me.id ? "본인 제보 삭제" : "제보 삭제",
    });
  }

  return NextResponse.json({ ok: true });
}
