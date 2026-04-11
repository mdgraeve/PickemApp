import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    slate: { findFirst: vi.fn() },
    game: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/espn", () => ({
  fetchESPNScoreboard: vi.fn(),
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNScoreboard } from "@/lib/espn";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockLeagueFindUnique = prisma.league.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;
const mockFetchESPNScoreboard = fetchESPNScoreboard as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/games/live`);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const fakeSession = { user: { id: "user-1", email: "a@b.com" } };
const fakeMembership = { id: "mem-1", userId: "user-1", leagueId, role: "member" };
const fakeLeague = { sport: "MLB" };
const fakeSlate = { id: "slate-1", leagueId, name: "Week 1", position: 1, status: "active" };

const fakeEspnInProgress = {
  id: "espn-500",
  homeTeam: "New York Mets",
  awayTeam: "Philadelphia Phillies",
  scheduledAt: new Date("2026-04-10T19:10:00Z"),
  status: "in_progress" as const,
  homeScore: 3,
  awayScore: 1,
  clock: "0:00",
  period: 7,
  shortDetail: "Bot 7th",
};

const fakeEspnCompleted = {
  id: "espn-501",
  homeTeam: "Atlanta Braves",
  awayTeam: "Miami Marlins",
  scheduledAt: new Date("2026-04-10T13:10:00Z"),
  status: "completed" as const,
  homeScore: 5,
  awayScore: 2,
  clock: null,
  period: null,
  shortDetail: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockResolvedValue(fakeSession);
  mockMemberFindUnique.mockResolvedValue(fakeMembership);
  mockLeagueFindUnique.mockResolvedValue(fakeLeague);
  mockSlateFindFirst.mockResolvedValue(fakeSlate);
  mockGameFindMany.mockResolvedValue([{ id: "g-1", espnGameId: "espn-500" }]);
  mockFetchESPNScoreboard.mockResolvedValue([fakeEspnInProgress]);
});

describe("GET /api/leagues/[leagueId]/games/live", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockMemberFindUnique.mockResolvedValue(null);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns {} when league has no sport", async () => {
    mockLeagueFindUnique.mockResolvedValue({ sport: null });
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({});
  });

  it("returns {} when there is no active slate", async () => {
    mockSlateFindFirst.mockResolvedValue(null);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({});
  });

  it("returns {} and does not call ESPN when no games have espnGameId", async () => {
    mockGameFindMany.mockResolvedValue([]);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({});
    expect(mockFetchESPNScoreboard).not.toHaveBeenCalled();
  });

  it("returns {} silently when ESPN throws", async () => {
    mockFetchESPNScoreboard.mockRejectedValue(new Error("ESPN 503"));
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({});
  });

  it("maps an in_progress game correctly to a LiveScoreEntry", async () => {
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body["g-1"]).toEqual({
      homeScore: 3,
      awayScore: 1,
      clock: "0:00",
      period: 7,
      shortDetail: "Bot 7th",
      status: "in_progress",
    });
  });

  it("omits a game not found in the ESPN response", async () => {
    mockGameFindMany.mockResolvedValue([
      { id: "g-1", espnGameId: "espn-500" },
      { id: "g-2", espnGameId: "espn-999" }, // not in ESPN response
    ]);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(body["g-1"]).toBeDefined();
    expect(body["g-2"]).toBeUndefined();
  });

  it("ignores extra ESPN games that are not in the active slate", async () => {
    mockFetchESPNScoreboard.mockResolvedValue([
      fakeEspnInProgress,
      { ...fakeEspnInProgress, id: "espn-999" }, // extra ESPN game, not in slate
    ]);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["g-1"]);
  });

  it("includes a game that ESPN reports as completed with its final score", async () => {
    mockGameFindMany.mockResolvedValue([{ id: "g-1", espnGameId: "espn-501" }]);
    mockFetchESPNScoreboard.mockResolvedValue([fakeEspnCompleted]);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body["g-1"]).toEqual({
      homeScore: 5,
      awayScore: 2,
      clock: null,
      period: null,
      shortDetail: null,
      status: "completed",
    });
  });

  it("omits a game that ESPN reports as scheduled", async () => {
    const fakeEspnScheduled = {
      id: "espn-502",
      homeTeam: "Boston Red Sox",
      awayTeam: "Toronto Blue Jays",
      scheduledAt: new Date("2026-04-10T23:05:00Z"),
      status: "scheduled" as const,
      homeScore: null,
      awayScore: null,
      clock: null,
      period: null,
      shortDetail: null,
    };
    mockGameFindMany.mockResolvedValue([{ id: "g-1", espnGameId: "espn-502" }]);
    mockFetchESPNScoreboard.mockResolvedValue([fakeEspnScheduled]);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({});
  });
});
