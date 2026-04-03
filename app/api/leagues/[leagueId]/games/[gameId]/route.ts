import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

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

export async function PATCH(
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

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can record game results" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  const homeScore =
    typeof raw?.homeScore === "number" && Number.isInteger(raw.homeScore) && raw.homeScore >= 0
      ? raw.homeScore
      : null;

  const awayScore =
    typeof raw?.awayScore === "number" && Number.isInteger(raw.awayScore) && raw.awayScore >= 0
      ? raw.awayScore
      : null;

  if (homeScore === null) {
    return NextResponse.json(
      { error: "homeScore must be a non-negative integer" },
      { status: 400 },
    );
  }

  if (awayScore === null) {
    return NextResponse.json(
      { error: "awayScore must be a non-negative integer" },
      { status: 400 },
    );
  }

  const existing = await prisma.game.findUnique({ where: { id: gameId } });

  if (!existing || existing.leagueId !== leagueId) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const wasAlreadyCompleted = existing.status === "completed";

  const game = await prisma.game.update({
    where: { id: gameId },
    data: { homeScore, awayScore, status: "completed" },
  });

  if (!wasAlreadyCompleted && game.slateId) {
    await tryPromoteNextSlate(game.slateId, leagueId);
  }

  return NextResponse.json(game);
}
