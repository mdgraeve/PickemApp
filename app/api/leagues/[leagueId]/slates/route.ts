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

  const slates = await prisma.slate.findMany({
    where: { leagueId },
    include: { _count: { select: { games: true } } },
    orderBy: { position: "asc" },
  });

  const result = slates.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    status: s.status,
    gameCount: s._count.games,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  return NextResponse.json(result);
}

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

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can create slates" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    typeof (body as Record<string, unknown>)?.name === "string"
      ? ((body as Record<string, unknown>).name as string).trim()
      : "";

  if (!name) {
    return NextResponse.json({ error: "Slate name is required" }, { status: 400 });
  }

  const rawPosition = (body as Record<string, unknown>)?.position;
  const position =
    typeof rawPosition === "number" && Number.isInteger(rawPosition) && rawPosition > 0
      ? rawPosition
      : null;

  if (position === null) {
    return NextResponse.json(
      { error: "position must be a positive integer" },
      { status: 400 },
    );
  }

  // Auto-activate this slate if no active slate exists for the league yet.
  const activeSlate = await prisma.slate.findFirst({
    where: { leagueId, status: "active" },
  });
  const status = activeSlate ? "upcoming" : "active";

  try {
    const slate = await prisma.slate.create({
      data: { leagueId, name, position, status },
    });
    return NextResponse.json(slate, { status: 201 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: `A slate at position ${position} already exists in this league` },
        { status: 409 },
      );
    }
    throw err;
  }
}
