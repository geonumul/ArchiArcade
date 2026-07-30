import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasDatabase, prisma } from "@/lib/db";
import { readToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const claims = await readToken(token);
  if (!claims) return NextResponse.json({ user: null });

  if (!hasDatabase || !prisma) {
    return NextResponse.json({ user: { name: claims.name, locale: "ko", plays: 0, minorPicks: 0 } });
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { profile: true },
  });
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      name: user.name,
      locale: user.locale,
      plays: user.profile?.plays ?? 0,
      minorPicks: user.profile?.minorPicks ?? 0,
    },
  });
}
