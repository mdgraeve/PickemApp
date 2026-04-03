import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findFirst: vi.fn() },
    game: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/games`);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const fakeMembership = { id: "mem-1", userId: "user-1", leagueId, role: "member" };

const fakeActiveSlate = {
  id: "slate-1",
  leagueId,
  name: "Week 1",
  position: 1,
  status: "active",
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-01"),
};

const fakeGames = [
  {
    id: "game-1",
    leagueId,
    slateId: "slate-1",
    homeTeam: "Chiefs",
    awayTeam: "Ravens",
    startTime: new Date("2026-09-06T20:20:00Z").toISOString(),
    homeScore: null,
    awayScore: null,
    status: "scheduled",
  },
  {
    id: "game-2",
    leagueId,
    slateId: "slate-1",
    homeTeam: "Cowboys",
    awayTeam: "Giants",
    startTime: new Date("2026-09-07T17:00:00Z").toISOString(),
    homeScore: null,
    awayScore: null,
    status: "scheduled",
  },
];

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
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockMemberFindUnique).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: "user-1", leagueId } },
    });
  });

  it("returns slate:null and empty games array when no active slate exists", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slate).toBeNull();
    expect(body.games).toEqual([]);
  });

  it("returns games for the active slate with slate metadata", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(fakeActiveSlate);
    mockGameFindMany.mockResolvedValue(fakeGames);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slate).toMatchObject({
      id: "slate-1",
      name: "Week 1",
      position: 1,
      status: "active",
    });
    expect(body.games).toHaveLength(2);
    expect(body.games[0].id).toBe("game-1");
    expect(body.games[1].id).toBe("game-2");
  });

  it("queries for the active slate and its games with correct args", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(fakeActiveSlate);
    mockGameFindMany.mockResolvedValue(fakeGames);

    await GET(fakeRequest, fakeContext);

    expect(mockSlateFindFirst).toHaveBeenCalledWith({
      where: { leagueId, status: "active" },
    });
    expect(mockGameFindMany).toHaveBeenCalledWith({
      where: { slateId: "slate-1" },
      orderBy: { startTime: "asc" },
    });
  });
});
