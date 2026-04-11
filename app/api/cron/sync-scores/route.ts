import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchESPNScoreboard } from "@/lib/espn";
import type { Sport } from "@/lib/sports";

// ---------------------------------------------------------------------------
// Slate promotion (mirrors the logic in the game PATCH route)
// ---------------------------------------------------------------------------

async function tryPromoteNextSlate(slateId: string, leagueId: string) {
  const incompleteCount = await prisma.game.count({
    where: { slateId, NOT: { status: "completed" } },
  });

  if (incompleteCount > 0) return;

  const currentSlate = await prisma.slate.update({
    where: { id: slateId },
    data: { status: "completed" },
  });

  const nextSlate = await prisma.slate.findFirst({
    where: { leagueId, position: currentSlate.position + 1, status: "upcoming" },
  });

  if (nextSlate) {
    await prisma.slate.update({
      where: { id: nextSlate.id },
      data: { status: "active" },
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/cron/sync-scores
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Auth: shared secret sent in the x-cron-secret header by Vercel Cron.
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");

  if (!cronSecret || !headerSecret || headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Discover which sports currently have active slates.
  const activeSlates = await prisma.slate.findMany({
    where: { status: "active" },
    include: { league: { select: { sport: true } } },
  });

  const sports = [
    ...new Set(
      activeSlates
        .map((s) => s.league.sport)
        .filter((sport): sport is string => sport !== null),
    ),
  ] as Sport[];

  if (sports.length === 0) {
    return NextResponse.json({ synced: 0, updated: 0, sports: [] });
  }

  let totalUpdated = 0;
  const sportResults: Record<string, number> = {};

  for (const sport of sports) {
    let espnGames;
    try {
      espnGames = await fetchESPNScoreboard(sport);
    } catch {
      // ESPN unreachable for this sport — skip it, don't fail the entire run.
      sportResults[sport] = 0;
      continue;
    }

    const completedGames = espnGames.filter((g) => g.status === "completed");
    let sportUpdated = 0;

    for (const espnGame of completedGames) {
      // Find all Game rows linked to this ESPN game ID (may span multiple leagues).
      const matchingGames = await prisma.game.findMany({
        where: { espnGameId: espnGame.id },
      });

      for (const game of matchingGames) {
        if (game.status === "completed") continue; // already scored, skip

        await prisma.game.update({
          where: { id: game.id },
          data: {
            homeScore: espnGame.homeScore,
            awayScore: espnGame.awayScore,
            status: "completed",
          },
        });

        sportUpdated++;

        if (game.slateId) {
          await tryPromoteNextSlate(game.slateId, game.leagueId);
        }
      }
    }

    sportResults[sport] = sportUpdated;
    totalUpdated += sportUpdated;
  }

  return NextResponse.json({
    synced: sports.length,
    updated: totalUpdated,
    sports: sportResults,
  });
}
