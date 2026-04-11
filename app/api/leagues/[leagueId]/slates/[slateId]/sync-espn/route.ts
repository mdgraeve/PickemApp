import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNSchedule } from "@/lib/espn";
import type { Sport } from "@/lib/sports";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;

  // --- League admin check ---
  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId } },
    select: { role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Get league sport ---
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { sport: true },
  });
  if (!league?.sport) {
    return NextResponse.json(
      { error: "League has no sport configured" },
      { status: 400 },
    );
  }

  // --- Input validation ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const date = raw?.date;

  if (typeof date !== "string" || !/^\d{8}$/.test(date)) {
    return NextResponse.json(
      { error: "date is required and must be in YYYYMMDD format" },
      { status: 400 },
    );
  }

  // --- ESPN fetch ---
  let espnGames;
  try {
    espnGames = await fetchESPNSchedule(league.sport as Sport, date);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `ESPN API error: ${message}` },
      { status: 502 },
    );
  }

  if (espnGames.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, games: [] });
  }

  // Derive season from the year portion of the date (e.g. "20260914" → "2026")
  const season = date.substring(0, 4);

  // --- Upsert into SportGame ---
  const espnIds = espnGames.map((g) => g.id);

  const existing = await prisma.sportGame.findMany({
    where: { espnId: { in: espnIds } },
    select: { espnId: true },
  });
  const existingIdSet = new Set(existing.map((sg) => sg.espnId!));

  const toInsert = espnGames.filter((g) => !existingIdSet.has(g.id));
  const toUpdate = espnGames.filter((g) => existingIdSet.has(g.id));

  if (toInsert.length > 0) {
    await prisma.sportGame.createMany({
      data: toInsert.map((g) => ({
        sport: league.sport!,
        season,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        scheduledAt: g.scheduledAt,
        espnId: g.id,
      })),
    });
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((g) =>
        prisma.sportGame.update({
          where: { espnId: g.id },
          data: {
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            scheduledAt: g.scheduledAt,
          },
        }),
      ),
    );
  }

  // Return the exact SportGame rows that ESPN provided — the UI uses these
  // directly so it never has to re-query by date (which would have timezone
  // boundary problems for late west-coast games).
  const syncedGames = await prisma.sportGame.findMany({
    where: { espnId: { in: espnIds } },
    orderBy: { scheduledAt: "asc" },
  });

  // --- Backfill espnGameId on existing Game rows in this slate that lack it ---
  // Covers games that were added before ESPN IDs were wired through.
  // Matching by homeTeam + awayTeam is safe within a single slate.
  // Picks are untouched — only the espnGameId column is updated.
  const espnIdByTeams = new Map(
    syncedGames.map((sg) => [`${sg.homeTeam}|${sg.awayTeam}`, sg.espnId]),
  );

  const unlinkedGames = await prisma.game.findMany({
    where: { slateId, espnGameId: null },
    select: { id: true, homeTeam: true, awayTeam: true },
  });

  const toLink = unlinkedGames.filter((g) =>
    espnIdByTeams.has(`${g.homeTeam}|${g.awayTeam}`),
  );

  if (toLink.length > 0) {
    await Promise.all(
      toLink.map((g) =>
        prisma.game.update({
          where: { id: g.id },
          data: { espnGameId: espnIdByTeams.get(`${g.homeTeam}|${g.awayTeam}`) },
        }),
      ),
    );
  }

  return NextResponse.json({ inserted: toInsert.length, updated: toUpdate.length, games: syncedGames });
}
