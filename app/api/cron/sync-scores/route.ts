import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchESPNScoreboard, fetchESPNSchedule } from "@/lib/espn";
import type { ESPNGame } from "@/lib/espn";
import type { Sport } from "@/lib/sports";

/** Converts a Date to ESPN's YYYYMMDD date string (UTC). */
function toESPNDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

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

  // Discover which sports currently have active slates, and collect unscored
  // games so we can back-fill results for any games that finished yesterday
  // (or earlier) and are no longer in today's default ESPN scoreboard response.
  const activeSlates = await prisma.slate.findMany({
    where: { status: "active" },
    include: {
      league: { select: { sport: true } },
      games: {
        where: { status: { not: "completed" } },
        select: { startTime: true },
      },
    },
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

  // Build a map of sport -> Set of past YYYYMMDD dates that have unscored games.
  const todayStr = toESPNDate(new Date());
  const sportPastDates = new Map<string, Set<string>>();
  for (const slate of activeSlates) {
    const sport = slate.league.sport;
    if (!sport) continue;
    for (const game of slate.games) {
      const gameDate = toESPNDate(game.startTime);
      if (gameDate < todayStr) {
        if (!sportPastDates.has(sport)) sportPastDates.set(sport, new Set());
        sportPastDates.get(sport)!.add(gameDate);
      }
    }
  }

  let totalUpdated = 0;
  const sportResults: Record<string, number> = {};

  for (const sport of sports) {
    // Fetch today's scoreboard first, then prepend past-date games so that the
    // completed version from a past date takes priority when deduplicating.
    let todayGames: ESPNGame[];
    try {
      todayGames = await fetchESPNScoreboard(sport);
    } catch {
      // ESPN unreachable for this sport — skip it, don't fail the entire run.
      sportResults[sport] = 0;
      continue;
    }

    // Collect past-date results (failures are silently skipped).
    const pastGames: ESPNGame[] = [];
    for (const date of sportPastDates.get(sport) ?? []) {
      try {
        pastGames.push(...(await fetchESPNSchedule(sport, date)));
      } catch {
        // One past date failed — skip it, don't abort the rest.
      }
    }

    // Merge past-date games FIRST so their completed status takes priority if
    // a game appears in both lists (e.g. finished yesterday, still in today's
    // feed with a stale "in_progress" status).
    const merged = [...pastGames, ...todayGames];
    const seen = new Set<string>();
    const espnGames = merged.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });

    const completedGames = espnGames.filter((g) => g.status === "completed");
    let sportUpdated = 0;

    for (const espnGame of completedGames) {
      // Primary match: find Game rows linked to this ESPN game ID.
      let matchingGames = await prisma.game.findMany({
        where: { espnGameId: espnGame.id },
      });

      // Fallback: if no espnGameId match, try matching by home/away team names
      // and the game's calendar date. This handles games created from SportGame
      // records that were missing espnId at creation time.
      if (matchingGames.length === 0) {
        const dayStart = new Date(espnGame.scheduledAt);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

        matchingGames = await prisma.game.findMany({
          where: {
            espnGameId: null,
            homeTeam: espnGame.homeTeam,
            awayTeam: espnGame.awayTeam,
            startTime: { gte: dayStart, lt: dayEnd },
            slate: { status: "active" },
          },
        });
      }

      for (const game of matchingGames) {
        if (game.status === "completed") continue; // already scored, skip

        await prisma.game.update({
          where: { id: game.id },
          data: {
            homeScore: espnGame.homeScore,
            awayScore: espnGame.awayScore,
            status: "completed",
            // Backfill espnGameId so future cron runs use the fast path.
            espnGameId: game.espnGameId ?? espnGame.id,
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
