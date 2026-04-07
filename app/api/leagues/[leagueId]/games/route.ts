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
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeSlate = await prisma.slate.findFirst({
    where: { leagueId, status: "active" },
  });

  if (!activeSlate) {
    return NextResponse.json({ slate: null, games: [] });
  }

  const games = await prisma.game.findMany({
    where: { slateId: activeSlate.id },
    orderBy: { startTime: "asc" },
  });

  const gameIds = games.map((g) => g.id);
  const picks = await prisma.pick.findMany({
    where: { userId, gameId: { in: gameIds } },
  });
  const pickMap = new Map(picks.map((p) => [p.gameId, p.pickedTeam]));

  // Lock deadline: 30 minutes before the first game in the slate.
  const firstStart =
    games.length > 0
      ? new Date(Math.min(...games.map((g) => new Date(g.startTime).getTime())))
      : null;
  const lockDeadline = firstStart
    ? new Date(firstStart.getTime() - 30 * 60 * 1000)
    : null;

  return NextResponse.json({
    slate: {
      id: activeSlate.id,
      name: activeSlate.name,
      position: activeSlate.position,
      status: activeSlate.status,
      lockDeadline,
    },
    games: games.map((g) => ({
      ...g,
      myPick: pickMap.get(g.id) ?? null,
    })),
  });
}
