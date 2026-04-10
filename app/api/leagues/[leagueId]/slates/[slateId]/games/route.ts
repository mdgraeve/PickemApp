import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slate = await prisma.slate.findUnique({ where: { id: slateId } });

  if (!slate || slate.leagueId !== leagueId) {
    return NextResponse.json({ error: "Slate not found" }, { status: 404 });
  }

  const games = await prisma.game.findMany({
    where: { slateId },
    orderBy: { startTime: "asc" },
  });

  const gameIds = games.map((g) => g.id);
  const picks = await prisma.pick.findMany({
    where: { userId, gameId: { in: gameIds } },
  });
  const pickMap = new Map(picks.map((p) => [p.gameId, p.pickedTeam]));

  return NextResponse.json({
    slate: {
      id: slate.id,
      name: slate.name,
      position: slate.position,
      status: slate.status,
    },
    games: games.map((g) => ({
      ...g,
      myPick: pickMap.get(g.id) ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can add games to a slate" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = (body as Record<string, unknown>)?.sportGameIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "sportGameIds must be a non-empty array" },
      { status: 400 },
    );
  }

  const sportGameIds = rawIds.filter((id): id is string => typeof id === "string");
  if (sportGameIds.length !== rawIds.length) {
    return NextResponse.json(
      { error: "All sportGameIds must be strings" },
      { status: 400 },
    );
  }

  const slate = await prisma.slate.findUnique({ where: { id: slateId } });
  if (!slate || slate.leagueId !== leagueId) {
    return NextResponse.json({ error: "Slate not found" }, { status: 404 });
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId } });

  const sportGames = await prisma.sportGame.findMany({
    where: { id: { in: sportGameIds } },
  });

  if (sportGames.length !== sportGameIds.length) {
    return NextResponse.json(
      { error: "One or more sportGameIds were not found" },
      { status: 400 },
    );
  }

  if (league?.sport) {
    const mismatch = sportGames.find((sg) => sg.sport !== league.sport);
    if (mismatch) {
      return NextResponse.json(
        {
          error: `Game "${mismatch.homeTeam} vs ${mismatch.awayTeam}" is a ${mismatch.sport} game but this league is ${league.sport}`,
        },
        { status: 400 },
      );
    }
  }

  await prisma.game.createMany({
    data: sportGames.map((sg) => ({
      leagueId,
      slateId,
      homeTeam: sg.homeTeam,
      awayTeam: sg.awayTeam,
      startTime: sg.scheduledAt,
      status: "scheduled",
      espnGameId: sg.espnId ?? null,
    })),
  });

  const games = await prisma.game.findMany({
    where: { slateId },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(games, { status: 201 });
}
