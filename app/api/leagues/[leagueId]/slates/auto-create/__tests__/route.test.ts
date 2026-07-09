import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    sportGame: { findMany: vi.fn() },
    slate: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMember = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockFindLeague = prisma.league.findUnique as ReturnType<typeof vi.fn>;
const mockSportGameFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const LEAGUE_ID = "league-1";
const USER_ID = "user-1";

const authedSession = { user: { id: USER_ID, email: "admin@example.com" } };
const adminMember = { role: "admin" };
const memberMember = { role: "member" };
const nflLeague = { sport: "NFL" };

const fakeSportGames = [
  { id: "sg-1", sport: "NFL", homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens", scheduledAt: new Date("2026-09-07T00:20:00Z"), espnId: "espn-1" },
  { id: "sg-2", sport: "NFL", homeTeam: "Dallas Cowboys", awayTeam: "New York Giants", scheduledAt: new Date("2026-09-07T17:00:00Z"), espnId: "espn-2" },
];

const fakeCreatedSlate = {
  id: "slate-new",
  leagueId: LEAGUE_ID,
  name: "Office NFL Pool – Week 4",
  position: 1,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeGames = [
  { id: "game-1", homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens" },
  { id: "game-2", homeTeam: "Dallas Cowboys", awayTeam: "New York Giants" },
];

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/leagues/${LEAGUE_ID}/slates/auto-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ leagueId: LEAGUE_ID }) };
}

const defaultTransactionResult = {
  slate: { ...fakeCreatedSlate, gameCount: 2 },
  games: fakeGames,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(authedSession);
  mockFindMember.mockResolvedValue(adminMember);
  mockFindLeague.mockResolvedValue(nflLeague);
  mockSportGameFindMany.mockResolvedValue(fakeSportGames);
  // findFirst: no existing slates, no active slate
  mockSlateFindFirst.mockResolvedValue(null);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      slate: { create: vi.fn().mockResolvedValue(fakeCreatedSlate) },
      game: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue(fakeGames),
      },
    }),
  );
});

describe("POST /auto-create", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Week 1", sportGameIds: ["sg-1"] }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a league member", async () => {
    mockFindMember.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Week 1", sportGameIds: ["sg-1"] }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin members", async () => {
    mockFindMember.mockResolvedValue(memberMember);
    const res = await POST(makeRequest({ name: "Week 1", sportGameIds: ["sg-1"] }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ sportGameIds: ["sg-1"] }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/);
  });

  it("returns 400 when sportGameIds is empty", async () => {
    const res = await POST(makeRequest({ name: "Week 1", sportGameIds: [] }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sportGameIds/);
  });

  it("returns 400 when sportGameIds is missing", async () => {
    const res = await POST(makeRequest({ name: "Week 1" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 when a sportGameId is not found", async () => {
    mockSportGameFindMany.mockResolvedValue([fakeSportGames[0]]); // only 1 found, 2 requested
    const res = await POST(
      makeRequest({ name: "Week 1", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found/);
  });

  it("returns 400 when a sport game's sport mismatches the league", async () => {
    mockSportGameFindMany.mockResolvedValue([
      { ...fakeSportGames[0], sport: "NBA" }, // wrong sport
      fakeSportGames[1],
    ]);
    const res = await POST(
      makeRequest({ name: "Week 1", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/NBA game but this league is NFL/);
  });

  it("creates the slate and returns 201 on success", async () => {
    const res = await POST(
      makeRequest({ name: "Office NFL Pool \u2013 Week 4", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slate.name).toBe("Office NFL Pool – Week 4");
    expect(body.slate.gameCount).toBe(2);
    expect(body.games).toHaveLength(2);
  });

  it("sets position to 1 when no slates exist", async () => {
    mockSlateFindFirst.mockResolvedValue(null);
    let capturedData: { position?: number } = {};
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const createFn = vi.fn().mockImplementation((args: { data: { position: number } }) => {
        capturedData = args.data;
        return Promise.resolve(fakeCreatedSlate);
      });
      return fn({
        slate: { create: createFn },
        game: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          findMany: vi.fn().mockResolvedValue(fakeGames),
        },
      });
    });

    await POST(
      makeRequest({ name: "Week 1", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );

    expect(capturedData.position).toBe(1);
  });

  it("sets position to maxPosition + 1 when slates exist", async () => {
    mockSlateFindFirst
      .mockResolvedValueOnce({ position: 3 }) // max position slate
      .mockResolvedValueOnce(null);           // no active slate

    let capturedData: { position?: number } = {};
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const createFn = vi.fn().mockImplementation((args: { data: { position: number } }) => {
        capturedData = args.data;
        return Promise.resolve({ ...fakeCreatedSlate, position: 4 });
      });
      return fn({
        slate: { create: createFn },
        game: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          findMany: vi.fn().mockResolvedValue(fakeGames),
        },
      });
    });

    await POST(
      makeRequest({ name: "Week 4", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );

    expect(capturedData.position).toBe(4);
  });

  it("sets status to active when no active slate exists", async () => {
    mockSlateFindFirst
      .mockResolvedValueOnce(null) // max position
      .mockResolvedValueOnce(null); // no active slate

    let capturedData: { status?: string } = {};
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const createFn = vi.fn().mockImplementation((args: { data: { status: string } }) => {
        capturedData = args.data;
        return Promise.resolve(fakeCreatedSlate);
      });
      return fn({
        slate: { create: createFn },
        game: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          findMany: vi.fn().mockResolvedValue(fakeGames),
        },
      });
    });

    await POST(
      makeRequest({ name: "Week 1", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );

    expect(capturedData.status).toBe("active");
  });

  it("sets status to upcoming when an active slate already exists", async () => {
    mockSlateFindFirst
      .mockResolvedValueOnce(null)              // max position
      .mockResolvedValueOnce({ id: "active-1" }); // active slate exists

    let capturedData: { status?: string } = {};
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const createFn = vi.fn().mockImplementation((args: { data: { status: string } }) => {
        capturedData = args.data;
        return Promise.resolve({ ...fakeCreatedSlate, status: "upcoming" });
      });
      return fn({
        slate: { create: createFn },
        game: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          findMany: vi.fn().mockResolvedValue(fakeGames),
        },
      });
    });

    await POST(
      makeRequest({ name: "Week 2", sportGameIds: ["sg-1", "sg-2"] }),
      makeParams(),
    );

    expect(capturedData.status).toBe("upcoming");
  });
});
