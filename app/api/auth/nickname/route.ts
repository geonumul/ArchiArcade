import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, db } from "@/lib/db";
import {
  readToken,
  isAdminName,
  signAccess,
  signRefresh,
  cookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  validName,
} from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 닉네임 바꾸기.
 *
 * 인증한 사람만 바꿀 수 있다. 아무나 바꿀 수 있으면 순위표 위쪽 사람 이름을 그대로
 * 따라 짓거나, 남 이름으로 갈아탄 뒤 글을 쓰는 일이 생긴다. 학교 메일까지 확인한
 * 사람이라면 그러기 어렵고, 그래도 하면 누구인지 남는다.
 *
 * 게임 순위의 이름은 함께 바꾸고, 게시판에 적힌 이름은 그대로 둔다. 순위표는 지금
 * 누가 몇 등인지를 보는 자리라 옛 이름이 남아 있으면 본인도 자기를 못 찾는다. 반면
 * 게시글은 그때 그 사람이 그 이름으로 남긴 기록이라 나중에 바꾸면 대화가 어긋난다.
 *
 *   GET   /api/auth/nickname   바꿀 수 있는지와 그 이유
 *   PATCH /api/auth/nickname { name }
 */

/// 너무 자주 바꾸면 누가 누구인지 아무도 못 따라간다. 하루 한 번으로 둔다.
const PER_DAY = 1;

async function whoami() {
  const jar = await cookies();
  const claims = await readToken(jar.get(ACCESS_COOKIE)?.value ?? "");
  return claims ? { id: claims.sub, name: claims.name } : null;
}

/**
 * 인증했는가.
 *
 * 메일 소유를 확인했거나(emailVerifiedAt), 학교 인증 기록이 있으면 인증한 것으로 본다.
 * 둘을 함께 보는 이유는 학교 인증이 계정과 따로 존재할 수 있기 때문이다 - 가입 없이
 * 인증만 한 사람도 있어서, 계정 쪽 표시만 보면 인증한 사람을 놓친다.
 */
async function verified(prisma: ReturnType<typeof db>, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, email: null as string | null };
  if (user.emailVerifiedAt) return { ok: true, email: user.email };
  if (!user.email) return { ok: false, email: null };
  const sv = await prisma.studentVerification.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  return { ok: Boolean(sv), email: user.email };
}

export async function GET() {
  if (!hasDatabase) return NextResponse.json({ can: false });

  const me = await whoami();
  if (!me) return NextResponse.json({ can: false, needLogin: true }, { status: 401 });

  const v = await verified(db(), me.id);
  return NextResponse.json({ can: v.ok, name: me.name, needVerify: !v.ok });
}

export async function PATCH(req: Request) {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL 필요" }, { status: 503 });

  const me = await whoami();
  if (!me) {
    return NextResponse.json({ error: "로그인이 필요해요", needLogin: true }, { status: 401 });
  }

  const prisma = db();
  const v = await verified(prisma, me.id);
  if (!v.ok) {
    return NextResponse.json(
      { error: "학교 인증을 하면 닉네임을 바꿀 수 있어요", needVerify: true },
      { status: 403 }
    );
  }

  // 사람 단위로 센다. 같은 학교 공용 와이파이에서 한 사람이 남의 몫을 쓰지 않게.
  const rl = await rateLimit(`nick:${me.id}`, PER_DAY, 86400);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "닉네임은 하루에 한 번만 바꿀 수 있어요", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!validName(name)) return NextResponse.json({ error: "닉네임을 확인해주세요" }, { status: 400 });
  if (name === me.name) return NextResponse.json({ ok: true, name });
  // 가입에서 막는 것과 같은 이름. 이름만 알면 선점할 수 있어서다.
  if (name.toLowerCase() === "admin" || isAdminName(name)) {
    return NextResponse.json({ error: "사용할 수 없는 이름이에요" }, { status: 400 });
  }
  if (await prisma.user.findUnique({ where: { name } })) {
    return NextResponse.json({ error: "이미 있는 닉네임이에요" }, { status: 409 });
  }

  await prisma.user.update({ where: { id: me.id }, data: { name } });

  /* 순위표에 박아 둔 이름도 같이 바꾼다. 순위는 지금 누가 몇 등인지를 보는 자리라
     옛 이름이 남아 있으면 본인도 자기를 못 찾는다. 게시판의 authorName 은 일부러
     두는데, 그때 그 이름으로 남긴 글이라 나중에 바꾸면 오가던 말이 어긋난다. */
  await prisma.archqScore.updateMany({ where: { userId: me.id }, data: { name } });

  /* 로그인 쿠키에 이름이 들어 있어서 다시 발급하지 않으면 다음 요청부터 옛 이름으로
     동작한다. 관리자 판별도 이름으로 하므로 이걸 빠뜨리면 권한이 어긋난다. */
  const claims = { sub: me.id, name, gen: 0 };
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await signAccess(claims), cookieOptions.access);
  jar.set(REFRESH_COOKIE, await signRefresh(claims), cookieOptions.refresh);

  return NextResponse.json({ ok: true, name });
}
