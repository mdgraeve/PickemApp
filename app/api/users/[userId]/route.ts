import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const requesterId = session.user.id;

  // Allow self-view; otherwise require a shared league
  if (requesterId !== userId) {
    const sharedMembership = await prisma.leagueMember.findFirst({
      where: {
        userId: requesterId,
        league: {
          members: {
            some: { userId },
          },
        },
      },
    });

    if (!sharedMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Per-league stats for the target user
  const memberships = await prisma.leagueMember.findMany({
    where: { userId },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          sport: true,
          games: {
            where: { status: "completed" },
            select: {
              homeTeam: true,
              awayTeam: true,
              homeScore: true,
              awayScore: true,
              picks: {
                where: { userId },
                select: { pickedTeam: true },
              },
            },
          },
        },
      },
    },
  });

  const stats = memberships.map((m) => {
    let correctPicks = 0;
    let totalPicks = 0;

    for (const game of m.league.games) {
      if (game.homeScore === null || game.awayScore === null) continue;
      const pick = game.picks[0];
      if (!pick) continue;

      totalPicks += 1;
      const winner =
        game.homeScore > game.awayScore
          ? game.homeTeam
          : game.awayScore > game.homeScore
            ? game.awayTeam
            : null;
      if (winner !== null && pick.pickedTeam === winner) {
        correctPicks += 1;
      }
    }

    return {
      leagueId: m.league.id,
      leagueName: m.league.name,
      sport: m.league.sport,
      correctPicks,
      totalPicks,
      accuracy: totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : null,
    };
  });

  // Recent pick history (up to 15 picks across all leagues)
  const recentPicks = await prisma.pick.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 15,
    include: {
      game: {
        select: {
          id: true,
          leagueId: true,
          homeTeam: true,
          awayTeam: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
          status: true,
          slate: { select: { name: true } },
          league: { select: { name: true } },
        },
      },
    },
  });

  const pickHistory = recentPicks.map((pick) => {
    const g = pick.game;
    const winner =
      g.homeScore !== null && g.awayScore !== null
        ? g.homeScore > g.awayScore
          ? g.homeTeam
          : g.awayScore > g.homeScore
            ? g.awayTeam
            : null
        : null;
    const isCorrect =
      g.status === "completed" && winner !== null
        ? pick.pickedTeam === winner
        : null;

    return {
      gameId: g.id,
      leagueId: g.leagueId,
      leagueName: g.league.name,
      slateName: g.slate?.name ?? null,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      startTime: g.startTime,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      pickedTeam: pick.pickedTeam,
      isCorrect,
    };
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    createdAt: user.createdAt,
    stats,
    pickHistory,
  });
}
