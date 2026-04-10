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
  const date = searchParams.get("date")?.trim() ?? "";

  if (!sport) {
    return NextResponse.json(
      { error: "sport query param is required" },
      { status: 400 },
    );
  }

  // Build date range filter when ?date=YYYYMMDD is provided.
  // A 36-hour window from midnight UTC covers US west coast late games
  // (latest ~5 AM UTC next day for a 10 PM PT start) without overlapping
  // with the next day's afternoon slate (first US games are ~17:00 UTC).
  let scheduledAtFilter: { gte: Date; lt: Date } | undefined;
  if (date) {
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    const start = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 36 * 3_600_000); // +36 h
    scheduledAtFilter = { gte: start, lt: end };
  }

  const games = await prisma.sportGame.findMany({
    where: {
      sport,
      ...(season ? { season } : {}),
      ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(games);
}
