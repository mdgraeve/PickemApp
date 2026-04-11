import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    sportGame: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    game: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/espn", () => ({
  fetchESPNSchedule: vi.fn(),
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNSchedule } from "@/lib/espn";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMember = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockFindLeague = prisma.league.findUnique as ReturnType<typeof vi.fn>;
const mockSportGameFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;
const mockCreateMany = prisma.sportGame.createMany as ReturnType<typeof vi.fn>;
const mockSportGameUpdate = prisma.sportGame.update as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;
const mockGameUpdate = prisma.game.update as ReturnType<typeof vi.fn>;
const mockFetchESPNSchedule = fetchESPNSchedule as ReturnType<typeof vi.fn>;

const LEAGUE_ID = "league-1";
const SLATE_ID = "slate-1";
const USER_ID = "user-1";

const authedSession = { user: { id: USER_ID, email: "admin@example.com" } };
const adminMember = { role: "admin" };
const memberMember = { role: "member" };
const nflLeague = { sport: "NFL" };

const fakeESPNGames = [
  {
    id: "espn-401547417",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Baltimore Ravens",
    scheduledAt: new Date("2026-09-07T00:20:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
  },
  {
    id: "espn-401547418",
    homeTeam: "Dallas Cowboys",
    awayTeam: "New York Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
  },
];

// Fake DB rows returned after upsert (second findMany call)
const fakeSyncedSportGames = [
  {
    id: "sg-1",
    sport: "NFL",
    season: "2026",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Baltimore Ravens",
    scheduledAt: new Date("2026-09-07T00:20:00Z"),
    espnId: "espn-401547417",
  },
  {
    id: "sg-2",
    sport: "NFL",
    season: "2026",
    homeTeam: "Dallas Cowboys",
    awayTeam: "New York Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    espnId: "espn-401547418",
  },
];

function makeRequest(body: unknown) {
  return new Request(
    `http://localhost/api/leagues/${LEAGUE_ID}/slates/${SLATE_ID}/sync-espn`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeParams() {
  return { params: Promise.resolve({ leagueId: LEAGUE_ID, slateId: SLATE_ID }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no unlinked games in the slate (backfill is a no-op)
  mockGameFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe("POST sync-espn — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(null);
    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is a member but not admin", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(memberMember);
    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("POST sync-espn — validation", () => {
  it("returns 400 when league has no sport", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue({ sport: null });
    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no sport/);
  });

  it("returns 400 when date is missing", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    const res = await POST(makeRequest({}), makeParams());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/date is required/);
  });

  it("returns 400 when date is not 8 digits", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    const res = await POST(makeRequest({ date: "2026-09-07" }), makeParams());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/YYYYMMDD/);
  });
});

// ---------------------------------------------------------------------------
// ESPN errors
// ---------------------------------------------------------------------------

describe("POST sync-espn — ESPN errors", () => {
  it("returns 502 when ESPN API throws", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockRejectedValue(
      new Error("ESPN API request failed: 503 Service Unavailable"),
    );
    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/ESPN API error/);
    expect(body.error).toMatch(/503/);
  });
});

// ---------------------------------------------------------------------------
// Upsert logic
// ---------------------------------------------------------------------------

describe("POST sync-espn — upsert logic", () => {
  it("inserts all games when none exist yet and returns them in the response", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    // First findMany: check existing espnIds → none
    // Second findMany: fetch synced rows to return to client
    mockSportGameFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(fakeSyncedSportGames);
    mockCreateMany.mockResolvedValue({ count: 2 });

    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.games).toHaveLength(2);
    expect(body.games[0].espnId).toBe("espn-401547417");
    expect(mockCreateMany).toHaveBeenCalledOnce();
    expect(mockSportGameUpdate).not.toHaveBeenCalled();
  });

  it("derives season from the year portion of the date", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue([fakeESPNGames[0]]);
    mockSportGameFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fakeSyncedSportGames[0]]);
    mockCreateMany.mockResolvedValue({ count: 1 });

    await POST(makeRequest({ date: "20260907" }), makeParams());

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sport: "NFL",
          season: "2026",
          espnId: "espn-401547417",
        }),
      ],
    });
  });

  it("updates existing games (idempotency) and returns them in the response", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    mockSportGameFindMany
      .mockResolvedValueOnce([{ espnId: "espn-401547417" }, { espnId: "espn-401547418" }])
      .mockResolvedValueOnce(fakeSyncedSportGames);
    mockSportGameUpdate.mockResolvedValue({});

    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(0);
    expect(body.updated).toBe(2);
    expect(body.games).toHaveLength(2);
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockSportGameUpdate).toHaveBeenCalledTimes(2);
  });

  it("returns 0/0 with empty games array and skips DB calls when ESPN returns no games", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue([]);

    const res = await POST(makeRequest({ date: "20260907" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ inserted: 0, updated: 0, games: [] });
    expect(mockSportGameFindMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockSportGameUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// espnGameId backfill
// ---------------------------------------------------------------------------

describe("POST sync-espn — espnGameId backfill", () => {
  function happyPathSetup() {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    mockSportGameFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(fakeSyncedSportGames);
    mockCreateMany.mockResolvedValue({ count: 2 });
  }

  it("writes espnGameId onto existing Game rows that have none", async () => {
    happyPathSetup();
    mockGameFindMany.mockResolvedValue([
      { id: "game-1", homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens" },
    ]);
    mockGameUpdate.mockResolvedValue({});

    await POST(makeRequest({ date: "20260907" }), makeParams());

    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { espnGameId: "espn-401547417" },
    });
  });

  it("backfills all matching unlinked games in one sync call", async () => {
    happyPathSetup();
    mockGameFindMany.mockResolvedValue([
      { id: "game-1", homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens" },
      { id: "game-2", homeTeam: "Dallas Cowboys", awayTeam: "New York Giants" },
    ]);
    mockGameUpdate.mockResolvedValue({});

    await POST(makeRequest({ date: "20260907" }), makeParams());

    expect(mockGameUpdate).toHaveBeenCalledTimes(2);
  });

  it("skips Game rows whose team names don't match any ESPN game", async () => {
    happyPathSetup();
    mockGameFindMany.mockResolvedValue([
      { id: "game-99", homeTeam: "Unknown Team A", awayTeam: "Unknown Team B" },
    ]);

    await POST(makeRequest({ date: "20260907" }), makeParams());

    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it("does not query Game table when ESPN returns no games", async () => {
    mockGetSession.mockResolvedValue(authedSession);
    mockFindMember.mockResolvedValue(adminMember);
    mockFindLeague.mockResolvedValue(nflLeague);
    mockFetchESPNSchedule.mockResolvedValue([]);

    await POST(makeRequest({ date: "20260907" }), makeParams());

    expect(mockGameFindMany).not.toHaveBeenCalled();
  });
});
