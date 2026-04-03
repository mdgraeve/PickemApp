import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Master game schedule seed data
//
// This script is idempotent: it clears all SportGame rows before inserting
// so it is safe to run multiple times during development.
//
// Run with: npx prisma db seed
// ---------------------------------------------------------------------------

const sportGames = [
  // -------------------------------------------------------------------------
  // NFL 2026 -- Week 1 (Sept 6-8, 2026)
  // -------------------------------------------------------------------------
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Baltimore Ravens",
    scheduledAt: new Date("2026-09-06T20:20:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Dallas Cowboys",
    awayTeam: "New York Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Green Bay Packers",
    awayTeam: "Chicago Bears",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Philadelphia Eagles",
    awayTeam: "Washington Commanders",
    scheduledAt: new Date("2026-09-07T20:25:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Los Angeles Rams",
    awayTeam: "San Francisco 49ers",
    scheduledAt: new Date("2026-09-08T00:20:00Z"),
  },

  // -------------------------------------------------------------------------
  // NFL 2026 -- Week 2 (Sept 13-15, 2026)
  // -------------------------------------------------------------------------
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Baltimore Ravens",
    awayTeam: "Kansas City Chiefs",
    scheduledAt: new Date("2026-09-13T17:00:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "New York Giants",
    awayTeam: "Dallas Cowboys",
    scheduledAt: new Date("2026-09-13T17:00:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Chicago Bears",
    awayTeam: "Green Bay Packers",
    scheduledAt: new Date("2026-09-13T20:25:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "Washington Commanders",
    awayTeam: "Philadelphia Eagles",
    scheduledAt: new Date("2026-09-14T17:00:00Z"),
  },
  {
    sport: "NFL",
    season: "2026",
    homeTeam: "San Francisco 49ers",
    awayTeam: "Los Angeles Rams",
    scheduledAt: new Date("2026-09-14T20:25:00Z"),
  },

  // -------------------------------------------------------------------------
  // NBA 2026-2027 -- Opening Week (Oct 19-21, 2026)
  // -------------------------------------------------------------------------
  {
    sport: "NBA",
    season: "2026-2027",
    homeTeam: "Boston Celtics",
    awayTeam: "New York Knicks",
    scheduledAt: new Date("2026-10-19T23:30:00Z"),
  },
  {
    sport: "NBA",
    season: "2026-2027",
    homeTeam: "Golden State Warriors",
    awayTeam: "Los Angeles Lakers",
    scheduledAt: new Date("2026-10-20T02:00:00Z"),
  },
  {
    sport: "NBA",
    season: "2026-2027",
    homeTeam: "Milwaukee Bucks",
    awayTeam: "Chicago Bulls",
    scheduledAt: new Date("2026-10-20T23:00:00Z"),
  },
  {
    sport: "NBA",
    season: "2026-2027",
    homeTeam: "Miami Heat",
    awayTeam: "Atlanta Hawks",
    scheduledAt: new Date("2026-10-21T23:30:00Z"),
  },
  {
    sport: "NBA",
    season: "2026-2027",
    homeTeam: "Denver Nuggets",
    awayTeam: "Phoenix Suns",
    scheduledAt: new Date("2026-10-21T02:00:00Z"),
  },
];

async function main() {
  console.log("Seeding master game schedule...");

  await prisma.sportGame.deleteMany();
  console.log("  Cleared existing SportGame rows.");

  const result = await prisma.sportGame.createMany({ data: sportGames });
  console.log(`  Created ${result.count} SportGame rows.`);

  const summary = await prisma.sportGame.groupBy({
    by: ["sport", "season"],
    _count: { id: true },
    orderBy: [{ sport: "asc" }, { season: "asc" }],
  });

  console.log("\nSchedule summary:");
  for (const row of summary) {
    console.log(`  ${row.sport} ${row.season}: ${row._count.id} games`);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
