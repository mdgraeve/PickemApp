import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNSchedule } from "@/lib/espn";
import { SPORTS } from "@/lib/sports";
import type { Sport } from "@/lib/sports";

// ---------------------------------------------------------------------------
// App-level admin check
//
// APP_ADMIN_EMAILS is a comma-separated list of email addresses that are
// permitted to call this endpoint. Compared case-insensitively. This is
// an operational gate — no User model flag or DB migration needed.
// ---------------------------------------------------------------------------

function isAppAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowList = process.env.APP_ADMIN_EMAILS ?? "";
  if (!allowList.trim()) return false;
  return allowList
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .includes(email.toLowerCase());
}

export async function POST(request: Request) {
  // --- Auth ---
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAppAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Input validation ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const sport = raw?.sport;
  const date = raw?.date;

  if (typeof sport !== "string" || !sport.trim()) {
    return NextResponse.json({ error: "sport is required" }, { status: 400 });
  }
  if (!(SPORTS as readonly string[]).includes(sport)) {
    return NextResponse.json(
      { error: `Invalid sport. Must be one of: ${SPORTS.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof date !== "string" || !/^\d{8}$/.test(date)) {
    return NextResponse.json(
      { error: "date is required and must be in YYYYMMDD format" },
      { status: 400 },
    );
  }

  // Derive season from the year portion of the date (e.g. "20260914" → "2026")
  const season = date.substring(0, 4);

  // --- ESPN fetch ---
  let espnGames;
  try {
    espnGames = await fetchESPNSchedule(sport as Sport, date);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `ESPN API error: ${message}` },
      { status: 502 },
    );
  }

  if (espnGames.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0 });
  }

  // --- Upsert: find existing rows by espnId, then insert/update ---
  const espnIds = espnGames.map((g) => g.id);

  const existing = await prisma.sportGame.findMany({
    where: { espnId: { in: espnIds } },
    select: { espnId: true },
  });
  const existingIdSet = new Set(existing.map((sg) => sg.espnId!));

  const toInsert = espnGames.filter((g) => !existingIdSet.has(g.id));
  const toUpdate = espnGames.filter((g) => existingIdSet.has(g.id));

  if (toInsert.length > 0) {
    await prisma.sportGame.createMany({
      data: toInsert.map((g) => ({
        sport,
        season,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        scheduledAt: g.scheduledAt,
        espnId: g.id,
      })),
    });
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((g) =>
        prisma.sportGame.update({
          where: { espnId: g.id },
          data: {
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            scheduledAt: g.scheduledAt,
          },
        }),
      ),
    );
  }

  return NextResponse.json({ inserted: toInsert.length, updated: toUpdate.length });
}
