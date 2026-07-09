import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

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

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  const name =
    typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const rawIds = raw.sportGameIds;
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

  // Validate sport games exist and match the league sport
  const [league, sportGames] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { sport: true } }),
    prisma.sportGame.findMany({ where: { id: { in: sportGameIds } } }),
  ]);

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

  // Compute next slate position and initial status
  const [maxPositionSlate, activeSlate] = await Promise.all([
    prisma.slate.findFirst({
      where: { leagueId },
      orderBy: { position: "desc" },
      select: { position: true },
    }),
    prisma.slate.findFirst({
      where: { leagueId, status: "active" },
      select: { id: true },
    }),
  ]);

  const nextPosition = (maxPositionSlate?.position ?? 0) + 1;
  const slateStatus = activeSlate ? "upcoming" : "active";

  // Atomically create the slate and all its games
  const result = await prisma.$transaction(async (tx) => {
    const slate = await tx.slate.create({
      data: { leagueId, name, position: nextPosition, status: slateStatus },
    });

    await tx.game.createMany({
      data: sportGames.map((sg) => ({
        leagueId,
        slateId: slate.id,
        homeTeam: sg.homeTeam,
        awayTeam: sg.awayTeam,
        startTime: sg.scheduledAt,
        status: "scheduled",
        espnGameId: sg.espnId ?? null,
      })),
    });

    const games = await tx.game.findMany({
      where: { slateId: slate.id },
      orderBy: { startTime: "asc" },
    });

    return { slate: { ...slate, gameCount: games.length }, games };
  });

  return NextResponse.json(result, { status: 201 });
}
