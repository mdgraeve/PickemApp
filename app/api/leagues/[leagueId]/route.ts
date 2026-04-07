import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    include: {
      league: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { league } = membership;

  return NextResponse.json({
    id: league.id,
    name: league.name,
    sport: league.sport,
    inviteCode: league.inviteCode,
    createdAt: league.createdAt,
    memberCount: league._count.members,
    role: membership.role,
  });
}
