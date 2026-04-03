import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
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

  const { searchParams } = new URL(request.url);
  const slateId = searchParams.get("slateId");

  if (slateId) {
    const slate = await prisma.slate.findUnique({ where: { id: slateId } });
    if (!slate || slate.leagueId !== leagueId) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }
  }

  const gameFilter = slateId
    ? { leagueId, status: "completed", slateId }
    : { leagueId, status: "completed" };

  const [members, completedGames] = await Promise.all([
    prisma.leagueMember.findMany({
      where: { leagueId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.game.findMany({
      where: gameFilter,
      select: {
        id: true,
        homeTeam: true,
        awayTeam: true,
        homeScore: true,
        awayScore: true,
        picks: {
          select: {
            userId: true,
            pickedTeam: true,
          },
        },
      },
    }),
  ]);

  type Entry = {
    userId: string;
    name: string | null;
    email: string;
    correct: number;
    totalPicks: number;
  };

  const scores = new Map<string, Entry>();
  for (const m of members) {
    scores.set(m.userId, {
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      correct: 0,
      totalPicks: 0,
    });
  }

  for (const game of completedGames) {
    if (game.homeScore === null || game.awayScore === null) continue;

    const winner =
      game.homeScore > game.awayScore
        ? game.homeTeam
        : game.awayScore > game.homeScore
          ? game.awayTeam
          : null;

    for (const pick of game.picks) {
      const entry = scores.get(pick.userId);
      if (!entry) continue;
      entry.totalPicks += 1;
      if (winner !== null && pick.pickedTeam === winner) {
        entry.correct += 1;
      }
    }
  }

  const sorted = [...scores.values()].sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  let rank = 1;
  const leaderboard = sorted.map((entry, i) => {
    if (i > 0 && sorted[i - 1].correct !== entry.correct) rank += 1;
    return { rank, ...entry };
  });

  return NextResponse.json(leaderboard);
}
