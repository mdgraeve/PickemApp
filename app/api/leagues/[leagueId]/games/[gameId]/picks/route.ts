import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, gameId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pickedTeam =
    typeof (body as Record<string, unknown>)?.pickedTeam === "string"
      ? ((body as Record<string, unknown>).pickedTeam as string).trim()
      : "";

  if (!pickedTeam) {
    return NextResponse.json(
      { error: "pickedTeam is required" },
      { status: 400 },
    );
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });

  if (!game || game.leagueId !== leagueId) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "scheduled") {
    return NextResponse.json(
      { error: "Picks can only be submitted for scheduled games" },
      { status: 400 },
    );
  }

  // Lock deadline: 30 minutes before the first game in the slate.
  // Falls back to the individual game's startTime for games without a slate.
  let lockDeadline: Date;
  if (game.slateId) {
    const agg = await prisma.game.aggregate({
      where: { slateId: game.slateId },
      _min: { startTime: true },
    });
    const firstStart = agg._min.startTime;
    lockDeadline = firstStart
      ? new Date(firstStart.getTime() - 30 * 60 * 1000)
      : game.startTime;
  } else {
    lockDeadline = game.startTime;
  }

  if (lockDeadline <= new Date()) {
    return NextResponse.json(
      { error: "Pick deadline has passed" },
      { status: 400 },
    );
  }

  const pick = await prisma.pick.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, pickedTeam },
    update: { pickedTeam },
  });

  return NextResponse.json(pick, { status: 200 });
}
