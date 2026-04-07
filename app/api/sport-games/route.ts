import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport")?.trim() ?? "";
  const season = searchParams.get("season")?.trim() ?? "";

  if (!sport) {
    return NextResponse.json(
      { error: "sport query param is required" },
      { status: 400 },
    );
  }

  const games = await prisma.sportGame.findMany({
    where: {
      sport,
      ...(season ? { season } : {}),
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(games);
}
