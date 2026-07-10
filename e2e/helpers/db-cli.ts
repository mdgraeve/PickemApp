// DB helper CLI for Playwright E2E specs.
//
// The Playwright transpiler cannot load the TypeScript Prisma client that
// `prisma generate` emits, so specs shell out to this script via tsx (the
// same runner prisma/seed.ts uses) instead of importing Prisma in-process.
//
// Usage: tsx e2e/helpers/db-cli.ts <command>   (JSON payload on stdin)
// Prints a JSON result on stdout.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function createUserWithSession(email: string, name: string) {
  const user = await prisma.user.create({
    data: { email, name, emailVerified: new Date() },
  });
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { userId: user.id, sessionToken };
}

type SetupPayload = {
  adminEmail: string;
  memberEmail: string;
  leagueName: string;
  game1Home: string;
  game1Away: string;
  game2Home: string;
  game2Away: string;
};

// Seed the fixture: admin + member users with sessions, a league whose only
// member is the admin, and one active slate holding two future games.
async function setup(payload: SetupPayload) {
  const admin = await createUserWithSession(payload.adminEmail, "E2E Admin");
  const member = await createUserWithSession(payload.memberEmail, "E2E Member");

  const league = await prisma.league.create({
    data: {
      name: payload.leagueName,
      sport: "NFL",
      createdById: admin.userId,
      members: { create: { userId: admin.userId, role: "admin" } },
    },
  });

  const slate = await prisma.slate.create({
    data: { leagueId: league.id, name: "Week 1", position: 1, status: "active" },
  });

  // Kickoff far enough out that the 30-minute pick lock never applies.
  const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const game1 = await prisma.game.create({
    data: {
      leagueId: league.id,
      slateId: slate.id,
      homeTeam: payload.game1Home,
      awayTeam: payload.game1Away,
      startTime,
    },
  });
  const game2 = await prisma.game.create({
    data: {
      leagueId: league.id,
      slateId: slate.id,
      homeTeam: payload.game2Home,
      awayTeam: payload.game2Away,
      startTime,
    },
  });

  return {
    adminToken: admin.sessionToken,
    memberToken: member.sessionToken,
    leagueId: league.id,
    inviteCode: league.inviteCode,
    game1Id: game1.id,
    game2Id: game2.id,
  };
}

// Snapshot of the state the specs assert on.
async function status(payload: { leagueId: string; memberEmail: string }) {
  const membership = await prisma.leagueMember.findFirst({
    where: { leagueId: payload.leagueId, user: { email: payload.memberEmail } },
  });
  const pickCount = await prisma.pick.count({
    where: {
      user: { email: payload.memberEmail },
      game: { leagueId: payload.leagueId },
    },
  });
  const slate = await prisma.slate.findFirst({
    where: { leagueId: payload.leagueId },
  });
  return {
    memberRole: membership?.role ?? null,
    pickCount,
    slateStatus: slate?.status ?? null,
  };
}

// League cascade removes slates, games, picks, memberships; user cascade
// removes sessions.
async function teardown(payload: { leagueId?: string; emails: string[] }) {
  if (payload.leagueId) {
    await prisma.league.deleteMany({ where: { id: payload.leagueId } });
  }
  await prisma.user.deleteMany({ where: { email: { in: payload.emails } } });
  return { ok: true };
}

async function main() {
  const command = process.argv[2];
  const raw = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
  const payload = raw.trim() ? JSON.parse(raw) : {};

  let result: unknown;
  switch (command) {
    case "setup":
      result = await setup(payload);
      break;
    case "status":
      result = await status(payload);
      break;
    case "teardown":
      result = await teardown(payload);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(JSON.stringify(result));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
