import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNCurrentWeek, fetchESPNWeeklyGames } from "@/lib/espn";
import { weekSlateName } from "@/lib/football";
import { checkRateLimit } from "@/lib/rate-limit";

type FootballSport = "NFL" | "NCAAF";

function isFootballSport(s: string | null | undefined): s is FootballSport {
  return s === "NFL" || s === "NCAAF";
}

// ---------------------------------------------------------------------------
// GET — return the current week number + season from ESPN (used to seed the UI)
// ---------------------------------------------------------------------------

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

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { sport: true },
  });
  if (!isFootballSport(league?.sport)) {
    return NextResponse.json(
      { error: "Auto-slate is only available for NFL and NCAAF leagues" },
      { status: 400 },
    );
  }

  try {
    const weekInfo = await fetchESPNCurrentWeek(league.sport);
    return NextResponse.json(weekInfo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `ESPN API error: ${message}` }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// POST — preview games for a given week; upserts into SportGame
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId } = await params;
  const userId = session.user.id;

  const rl = checkRateLimit(`auto-preview:${userId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { sport: true, name: true },
  });
  if (!isFootballSport(league?.sport)) {
    return NextResponse.json(
      { error: "Auto-slate preview is only available for NFL and NCAAF leagues" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  const week =
    typeof raw.week === "number" && Number.isInteger(raw.week) && raw.week >= 1
      ? raw.week
      : null;
  if (week === null) {
    return NextResponse.json(
      { error: "week must be a positive integer" },
      { status: 400 },
    );
  }

  const season =
    typeof raw.season === "number" &&
    Number.isInteger(raw.season) &&
    raw.season > 2000
      ? raw.season
      : null;
  if (season === null) {
    return NextResponse.json(
      { error: "season must be a valid year (e.g. 2026)" },
      { status: 400 },
    );
  }

  // Conference filter — NCAAF only, optional
  const rawConfs = raw.conferences;
  const conferenceIds: number[] | undefined =
    league.sport === "NCAAF" && Array.isArray(rawConfs)
      ? rawConfs.filter(
          (c): c is number => typeof c === "number" && Number.isInteger(c) && c > 0,
        )
      : undefined;

  // ESPN fetch
  let espnGames;
  try {
    espnGames = await fetchESPNWeeklyGames(
      league.sport,
      week,
      season,
      conferenceIds,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `ESPN API error: ${message}` }, { status: 502 });
  }

  if (espnGames.length === 0) {
    return NextResponse.json({
      slateName: weekSlateName(league.name, week),
      weekNumber: week,
      season,
      sportGames: [],
    });
  }

  // Upsert ESPN games into SportGame table
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
        season: String(season),
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

  const sportGames = await prisma.sportGame.findMany({
    where: { espnId: { in: espnIds } },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({
    slateName: weekSlateName(league.name, week),
    weekNumber: week,
    season,
    sportGames,
  });
}
