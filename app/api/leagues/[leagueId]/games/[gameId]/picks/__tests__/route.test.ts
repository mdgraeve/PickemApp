import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    game: { findUnique: vi.fn(), aggregate: vi.fn() },
    pick: { upsert: vi.fn() },
  },
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockGameFindUnique = prisma.game.findUnique as ReturnType<typeof vi.fn>;
const mockGameAggregate = prisma.game.aggregate as ReturnType<typeof vi.fn>;
const mockPickUpsert = prisma.pick.upsert as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const gameId = "game-1";
const fakeContext = { params: Promise.resolve({ leagueId, gameId }) };

function makeRequest(body: unknown) {
  return new Request(
    `http://localhost/api/leagues/${leagueId}/games/${gameId}/picks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const futureTime = new Date(Date.now() + 1000 * 60 * 60 * 24);

const fakeMembership = {
  id: "mem-1",
  userId: "user-1",
  leagueId,
  role: "member",
};

// Game with no slate — uses game.startTime as lock deadline
const fakeGame = {
  id: gameId,
  leagueId,
  slateId: null,
  homeTeam: "Team A",
  awayTeam: "Team B",
  startTime: futureTime,
  homeScore: null,
  awayScore: null,
  status: "scheduled",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Game in a slate — uses min(slate startTimes) - 30 min as lock deadline
const fakeGameWithSlate = { ...fakeGame, slateId: "slate-1" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/leagues/[leagueId]/games/[gameId]/picks", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when pickedTeam is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);

    const response = await POST(makeRequest({}), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("pickedTeam is required");
  });

  it("returns 404 when game does not exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Game not found");
  });

  it("returns 404 when game belongs to a different league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGame, leagueId: "other-league" });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Game not found");
  });

  it("returns 400 when game is not in scheduled status", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGame, status: "final" });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Picks can only be submitted for scheduled games");
  });

  // ---------------------------------------------------------------------------
  // No-slate fallback: lock at game.startTime
  // ---------------------------------------------------------------------------

  it("returns 400 when game has no slate and startTime is in the past", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue({
      ...fakeGame,
      startTime: new Date(Date.now() - 1000 * 60 * 60),
    });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Pick deadline has passed");
    expect(mockGameAggregate).not.toHaveBeenCalled();
  });

  it("returns 200 when game has no slate and startTime is in the future", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockPickUpsert.mockResolvedValue({
      id: "pick-1",
      userId: "user-1",
      gameId,
      pickedTeam: "Team A",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);

    expect(response.status).toBe(200);
    expect(mockGameAggregate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Slate-based lock: 30 minutes before first game in slate
  // ---------------------------------------------------------------------------

  it("returns 400 when slate first game is less than 30 minutes away", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);

    const firstGameTime = new Date(Date.now() + 20 * 60 * 1000); // 20 min from now
    mockGameFindUnique.mockResolvedValue({ ...fakeGameWithSlate, startTime: firstGameTime });
    mockGameAggregate.mockResolvedValue({ _min: { startTime: firstGameTime } });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Pick deadline has passed");
    expect(mockGameAggregate).toHaveBeenCalledWith({
      where: { slateId: "slate-1" },
      _min: { startTime: true },
    });
  });

  it("accepts pick when slate first game is more than 30 minutes away", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);

    const firstGameTime = new Date(Date.now() + 60 * 60 * 1000); // 60 min from now
    mockGameFindUnique.mockResolvedValue({ ...fakeGameWithSlate, startTime: firstGameTime });
    mockGameAggregate.mockResolvedValue({ _min: { startTime: firstGameTime } });
    mockPickUpsert.mockResolvedValue({
      id: "pick-1",
      userId: "user-1",
      gameId,
      pickedTeam: "Team A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);

    expect(response.status).toBe(200);
  });

  it("falls back to game.startTime when aggregate returns no result", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGameWithSlate, startTime: futureTime });
    mockGameAggregate.mockResolvedValue({ _min: { startTime: null } });
    mockPickUpsert.mockResolvedValue({
      id: "pick-1",
      userId: "user-1",
      gameId,
      pickedTeam: "Team A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);

    expect(response.status).toBe(200);
  });

  it("returns 200 with the pick on successful upsert", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);

    const fakePick = {
      id: "pick-1",
      userId: "user-1",
      gameId,
      pickedTeam: "Team A",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockPickUpsert.mockResolvedValue(fakePick);

    const response = await POST(makeRequest({ pickedTeam: "Team A" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pickedTeam).toBe("Team A");
    expect(body.userId).toBe("user-1");
    expect(body.gameId).toBe(gameId);
    expect(mockPickUpsert).toHaveBeenCalledWith({
      where: { userId_gameId: { userId: "user-1", gameId } },
      create: { userId: "user-1", gameId, pickedTeam: "Team A" },
      update: { pickedTeam: "Team A" },
    });
  });
});
