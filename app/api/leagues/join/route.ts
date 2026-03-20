import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const inviteCode =
    typeof (body as Record<string, unknown>)?.inviteCode === "string"
      ? ((body as Record<string, unknown>).inviteCode as string).trim()
      : "";

  if (!inviteCode) {
    return NextResponse.json(
      { error: "Invite code is required" },
      { status: 400 },
    );
  }

  const league = await prisma.league.findUnique({
    where: { inviteCode },
  });

  if (!league) {
    return NextResponse.json(
      { error: "League not found" },
      { status: 404 },
    );
  }

  const userId = session.user.id;

  const existing = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId: league.id } },
  });

  if (existing) {
    return NextResponse.json(
      { error: "You are already a member of this league" },
      { status: 409 },
    );
  }

  await prisma.leagueMember.create({
    data: {
      userId,
      leagueId: league.id,
      role: "member",
    },
  });

  return NextResponse.json(league, { status: 201 });
}
