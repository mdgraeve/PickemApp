import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;
  const userId = session.user.id;

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slate = await prisma.slate.findUnique({ where: { id: slateId } });
  if (!slate || slate.leagueId !== leagueId) {
    return NextResponse.json({ error: "Slate not found" }, { status: 404 });
  }
  if (slate.status !== "active") {
    return NextResponse.json(
      { error: "Only an active slate can be promoted" },
      { status: 400 },
    );
  }

  // Surface incomplete games so the admin knows what still needs scores.
  const incompleteGames = await prisma.game.findMany({
    where: { slateId, NOT: { status: "completed" } },
    select: { id: true, homeTeam: true, awayTeam: true },
  });

  if (incompleteGames.length > 0) {
    return NextResponse.json(
      {
        error: "All games must be scored before promoting the slate",
        incompleteGames,
      },
      { status: 400 },
    );
  }

  // Mark the slate as completed.
  const completedSlate = await prisma.slate.update({
    where: { id: slateId },
    data: { status: "completed" },
  });

  // Activate the next slate by position (if one exists).
  const nextSlate = await prisma.slate.findFirst({
    where: {
      leagueId,
      position: completedSlate.position + 1,
      status: "upcoming",
    },
  });

  if (nextSlate) {
    await prisma.slate.update({
      where: { id: nextSlate.id },
      data: { status: "active" },
    });
  }

  return NextResponse.json({
    completed: completedSlate.id,
    activated: nextSlate?.id ?? null,
  });
}
