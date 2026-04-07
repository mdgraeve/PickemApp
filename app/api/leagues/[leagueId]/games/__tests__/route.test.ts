import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findFirst: vi.fn() },
    game: { findMany: vi.fn() },
    pick: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;
const mockPickFindMany = prisma.pick.findMany as ReturnType<typeof vi.fn>;

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

// startTime as Date objects — first game is at 20:20 UTC
const game1StartTime = new Date("2026-09-06T20:20:00Z");
const game2StartTime = new Date("2026-09-07T17:00:00Z");

const fakeGames = [
  {
    id: "game-1",
    leagueId,
    slateId: "slate-1",
    homeTeam: "Chiefs",
    awayTeam: "Ravens",
    startTime: game1StartTime,
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
    startTime: game2StartTime,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mockPickFindMany.mockResolvedValue([]);
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

  it("includes myPick on each game", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(fakeActiveSlate);
    mockGameFindMany.mockResolvedValue(fakeGames);
    mockPickFindMany.mockResolvedValue([
      { gameId: "game-1", pickedTeam: "Chiefs" },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(body.games[0].myPick).toBe("Chiefs");
    expect(body.games[1].myPick).toBeNull();
  });

  it("includes lockDeadline 30 minutes before the first game", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(fakeActiveSlate);
    mockGameFindMany.mockResolvedValue(fakeGames);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    const expectedDeadline = new Date(game1StartTime.getTime() - 30 * 60 * 1000);
    expect(new Date(body.slate.lockDeadline).getTime()).toBe(expectedDeadline.getTime());
  });

  it("returns lockDeadline:null when slate has no games", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindFirst.mockResolvedValue(fakeActiveSlate);
    mockGameFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slate.lockDeadline).toBeNull();
    expect(body.games).toEqual([]);
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
