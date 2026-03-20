import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    game: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.leagueMember.findUnique as ReturnType<
  typeof vi.fn
>;
const mockFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request("http://localhost/api/leagues/league-1/games");
const fakeContext = { params: Promise.resolve({ leagueId }) };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/leagues/[leagueId]/games", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    mockFindUnique.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: "user-1", leagueId } },
    });
  });

  it("returns an empty array when no upcoming games exist", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    mockFindUnique.mockResolvedValue({
      id: "mem-1",
      userId: "user-1",
      leagueId,
      role: "member",
    });
    mockFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns upcoming games ordered by startTime ascending", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    mockFindUnique.mockResolvedValue({
      id: "mem-1",
      userId: "user-1",
      leagueId,
      role: "member",
    });

    const games = [
      {
        id: "game-1",
        leagueId,
        homeTeam: "Team A",
        awayTeam: "Team B",
        startTime: new Date("2026-04-01T18:00:00Z").toISOString(),
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        createdAt: new Date("2026-03-01").toISOString(),
        updatedAt: new Date("2026-03-01").toISOString(),
      },
      {
        id: "game-2",
        leagueId,
        homeTeam: "Team C",
        awayTeam: "Team D",
        startTime: new Date("2026-04-02T20:00:00Z").toISOString(),
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        createdAt: new Date("2026-03-01").toISOString(),
        updatedAt: new Date("2026-03-01").toISOString(),
      },
    ];
    mockFindMany.mockResolvedValue(games);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("game-1");
    expect(body[1].id).toBe("game-2");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        leagueId,
        status: "scheduled",
        startTime: { gt: expect.any(Date) },
      },
      orderBy: { startTime: "asc" },
    });
  });
});
