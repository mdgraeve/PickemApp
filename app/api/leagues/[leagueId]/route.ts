import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports";

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
    include: {
      league: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { league } = membership;

  return NextResponse.json({
    id: league.id,
    name: league.name,
    sport: league.sport,
    inviteCode: league.inviteCode,
    createdAt: league.createdAt,
    memberCount: league._count.members,
    role: membership.role,
  });
}

export async function PATCH(
  request: Request,
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

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can update league settings" },
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
  const updateData: { name?: string; sport?: string } = {};

  if (typeof raw.name === "string") {
    const trimmed = raw.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    updateData.name = trimmed;
  }

  if (typeof raw.sport === "string") {
    const trimmed = raw.sport.trim();
    if (!SPORTS.includes(trimmed as (typeof SPORTS)[number])) {
      return NextResponse.json(
        { error: `sport must be one of: ${SPORTS.join(", ")}` },
        { status: 400 },
      );
    }
    const slateCount = await prisma.slate.count({ where: { leagueId } });
    if (slateCount > 0) {
      return NextResponse.json(
        { error: "Cannot change sport after slates have been created" },
        { status: 400 },
      );
    }
    updateData.sport = trimmed;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const league = await prisma.league.update({
    where: { id: leagueId },
    data: updateData,
  });

  return NextResponse.json(league);
}
