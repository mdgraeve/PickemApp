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

  const name =
    typeof (body as Record<string, unknown>)?.name === "string"
      ? ((body as Record<string, unknown>).name as string).trim()
      : "";

  if (!name) {
    return NextResponse.json(
      { error: "League name is required" },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  const league = await prisma.$transaction(async (tx) => {
    const created = await tx.league.create({
      data: {
        name,
        createdById: userId,
      },
    });

    await tx.leagueMember.create({
      data: {
        userId,
        leagueId: created.id,
        role: "admin",
      },
    });

    return created;
  });

  return NextResponse.json(league, { status: 201 });
}
