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
  },
}));

vi.mock("@/lib/espn", () => ({
  fetchESPNCurrentWeek: vi.fn(),
  fetchESPNWeeklyGames: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true, retryAfterMs: 0 })),
}));

import { GET, POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNCurrentWeek, fetchESPNWeeklyGames } from "@/lib/espn";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMember = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockFindLeague = prisma.league.findUnique as ReturnType<typeof vi.fn>;
const mockSportGameFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;
const mockCreateMany = prisma.sportGame.createMany as ReturnType<typeof vi.fn>;
const mockSportGameUpdate = prisma.sportGame.update as ReturnType<typeof vi.fn>;
const mockFetchCurrentWeek = fetchESPNCurrentWeek as ReturnType<typeof vi.fn>;
const mockFetchWeeklyGames = fetchESPNWeeklyGames as ReturnType<typeof vi.fn>;

const LEAGUE_ID = "league-1";
const USER_ID = "user-1";

const authedSession = { user: { id: USER_ID, email: "admin@example.com" } };
const adminMember = { role: "admin" };
const memberMember = { role: "member" };
const nflLeague = { sport: "NFL", name: "Office NFL Pool" };
const ncaafLeague = { sport: "NCAAF", name: "CFB League" };
const nbaLeague = { sport: "NBA", name: "NBA Pool" };

const fakeESPNGames = [
  {
    id: "espn-1",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Baltimore Ravens",
    scheduledAt: new Date("2026-09-07T00:20:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
    clock: null,
    period: null,
    shortDetail: null,
  },
  {
    id: "espn-2",
    homeTeam: "Dallas Cowboys",
    awayTeam: "New York Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
    clock: null,
    period: null,
    shortDetail: null,
  },
];

const fakeSportGames = [
  { id: "sg-1", sport: "NFL", season: "2026", homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens", scheduledAt: new Date("2026-09-07T00:20:00Z"), espnId: "espn-1" },
  { id: "sg-2", sport: "NFL", season: "2026", homeTeam: "Dallas Cowboys", awayTeam: "New York Giants", scheduledAt: new Date("2026-09-07T17:00:00Z"), espnId: "espn-2" },
];

function makeRequest(body?: unknown): Request {
  return new Request(`http://localhost/api/leagues/${LEAGUE_ID}/slates/auto-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ leagueId: LEAGUE_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(authedSession);
  mockFindMember.mockResolvedValue(adminMember);
  mockFindLeague.mockResolvedValue(nflLeague);
  mockFetchCurrentWeek.mockResolvedValue({ weekNumber: 4, season: 2026, seasonType: 2 });
  mockFetchWeeklyGames.mockResolvedValue(fakeESPNGames);
  mockSportGameFindMany
    .mockResolvedValueOnce([]) // existing check
    .mockResolvedValueOnce(fakeSportGames); // final fetch
  mockCreateMany.mockResolvedValue({ count: 2 });
  mockSportGameUpdate.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// GET — current week
// ---------------------------------------------------------------------------

describe("GET /auto-preview", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a league member", async () => {
    mockFindMember.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin members", async () => {
    mockFindMember.mockResolvedValue(memberMember);
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-football leagues", async () => {
    mockFindLeague.mockResolvedValue(nbaLeague);
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/NFL and NCAAF/);
  });

  it("returns weekNumber, season, seasonType from ESPN", async () => {
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ weekNumber: 4, season: 2026, seasonType: 2 });
  });

  it("returns 502 when ESPN call fails", async () => {
    mockFetchCurrentWeek.mockRejectedValue(new Error("ESPN API request failed: 503"));
    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// POST — preview games
// ---------------------------------------------------------------------------

describe("POST /auto-preview", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ week: 1, season: 2026 }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a league member", async () => {
    mockFindMember.mockResolvedValue(null);
    const res = await POST(makeRequest({ week: 1, season: 2026 }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin members", async () => {
    mockFindMember.mockResolvedValue(memberMember);
    const res = await POST(makeRequest({ week: 1, season: 2026 }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-football leagues", async () => {
    mockFindLeague.mockResolvedValue(nbaLeague);
    const res = await POST(makeRequest({ week: 1, season: 2026 }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 when week is missing", async () => {
    const res = await POST(makeRequest({ season: 2026 }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/week/);
  });

  it("returns 400 when season is missing", async () => {
    const res = await POST(makeRequest({ week: 4 }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/season/);
  });

  it("returns 400 when season is implausibly small", async () => {
    const res = await POST(makeRequest({ week: 4, season: 1999 }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns slateName, weekNumber, season, sportGames on success", async () => {
    const res = await POST(makeRequest({ week: 4, season: 2026 }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slateName).toBe("Office NFL Pool \u2013 Week 4");
    expect(body.weekNumber).toBe(4);
    expect(body.season).toBe(2026);
    expect(body.sportGames).toHaveLength(2);
  });

  it("inserts new games into SportGame table", async () => {
    await POST(makeRequest({ week: 4, season: 2026 }), makeParams());
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ espnId: "espn-1" }),
          expect.objectContaining({ espnId: "espn-2" }),
        ]),
      }),
    );
  });

  it("updates existing SportGame rows instead of inserting duplicates", async () => {
    mockSportGameFindMany
      .mockReset()
      .mockResolvedValueOnce([{ espnId: "espn-1" }, { espnId: "espn-2" }]) // both exist
      .mockResolvedValueOnce(fakeSportGames);

    await POST(makeRequest({ week: 4, season: 2026 }), makeParams());

    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockSportGameUpdate).toHaveBeenCalledTimes(2);
  });

  it("returns empty sportGames when ESPN returns nothing", async () => {
    mockFetchWeeklyGames.mockResolvedValue([]);
    const res = await POST(makeRequest({ week: 4, season: 2026 }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sportGames).toEqual([]);
  });

  it("returns 502 when ESPN fetch fails", async () => {
    mockFetchWeeklyGames.mockRejectedValue(new Error("ESPN API request failed: 503"));
    const res = await POST(makeRequest({ week: 4, season: 2026 }), makeParams());
    expect(res.status).toBe(502);
  });

  it("passes conferenceIds to ESPN for NCAAF leagues", async () => {
    mockFindLeague.mockResolvedValue(ncaafLeague);
    await POST(makeRequest({ week: 1, season: 2026, conferences: [8, 5] }), makeParams());
    expect(mockFetchWeeklyGames).toHaveBeenCalledWith("NCAAF", 1, 2026, [8, 5]);
  });

  it("ignores conferences param for NFL leagues", async () => {
    await POST(makeRequest({ week: 4, season: 2026, conferences: [8] }), makeParams());
    // NFL should still pass undefined conferenceIds
    expect(mockFetchWeeklyGames).toHaveBeenCalledWith("NFL", 4, 2026, undefined);
  });
});
