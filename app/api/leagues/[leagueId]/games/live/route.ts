import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNScoreboard } from "@/lib/espn";
import type { Sport } from "@/lib/sports";

type LiveScoreEntry = {
  homeScore: number | null;
  awayScore: number | null;
  clock: string | null;
  period: number | null;
  shortDetail: string | null;
  status: string;
};

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

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { sport: true },
  });

  if (!league?.sport) {
    return NextResponse.json({});
  }

  const activeSlate = await prisma.slate.findFirst({
    where: { leagueId, status: "active" },
  });

  if (!activeSlate) {
    return NextResponse.json({});
  }

  const games = await prisma.game.findMany({
    where: {
      slateId: activeSlate.id,
      espnGameId: { not: null },
      status: { not: "completed" },
    },
    select: { id: true, espnGameId: true },
  });

  if (games.length === 0) {
    return NextResponse.json({});
  }

  let espnGames;
  try {
    espnGames = await fetchESPNScoreboard(league.sport as Sport);
  } catch {
    // Silent fail — polling will retry; retain client's last-known state
    return NextResponse.json({});
  }

  const espnMap = new Map(espnGames.map((g) => [g.id, g]));

  const result: Record<string, LiveScoreEntry> = {};
  for (const game of games) {
    const espnGame = espnMap.get(game.espnGameId!);
    if (espnGame && espnGame.status === "in_progress") {
      result[game.id] = {
        homeScore: espnGame.homeScore,
        awayScore: espnGame.awayScore,
        clock: espnGame.clock,
        period: espnGame.period,
        shortDetail: espnGame.shortDetail,
        status: espnGame.status,
      };
    }
  }

  return NextResponse.json(result);
}
