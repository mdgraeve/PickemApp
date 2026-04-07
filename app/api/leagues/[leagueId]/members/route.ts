import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

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
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can view the member list" },
      { status: 403 },
    );
  }

  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json(
    members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      name: m.user.name,
      email: m.user.email,
    })),
  );
}
