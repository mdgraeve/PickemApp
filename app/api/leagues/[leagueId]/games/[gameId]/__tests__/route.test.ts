import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    game: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    slate: { update: vi.fn(), findFirst: vi.fn() },
  },
}));

import { PATCH } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockGameFindUnique = prisma.game.findUnique as ReturnType<typeof vi.fn>;
const mockGameUpdate = prisma.game.update as ReturnType<typeof vi.fn>;
const mockGameCount = prisma.game.count as ReturnType<typeof vi.fn>;
const mockSlateUpdate = prisma.slate.update as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const gameId = "game-1";
const slateId = "slate-1";
const fakeContext = { params: Promise.resolve({ leagueId, gameId }) };

const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };

const fakeGame = {
  id: gameId,
  leagueId,
  slateId,
  homeTeam: "Chiefs",
  awayTeam: "Ravens",
  startTime: new Date("2026-09-06T20:20:00Z"),
  homeScore: null,
  awayScore: null,
  status: "scheduled",
};

const fakeUpdatedGame = {
  ...fakeGame,
  homeScore: 27,
  awayScore: 24,
  status: "completed",
};

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/leagues/${leagueId}/games/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/leagues/[leagueId]/games/[gameId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is a member but not an admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "b@b.com" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can record game results");
  });

  it("returns 400 when homeScore is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await PATCH(makeRequest({ awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("homeScore must be a non-negative integer");
  });

  it("returns 400 when awayScore is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await PATCH(makeRequest({ homeScore: 27 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("awayScore must be a non-negative integer");
  });

  it("returns 400 when homeScore is negative", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await PATCH(makeRequest({ homeScore: -1, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("homeScore must be a non-negative integer");
  });

  it("returns 404 when game does not exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Game not found");
  });

  it("returns 404 when game belongs to a different league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGame, leagueId: "other-league" });

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Game not found");
  });

  it("returns 200 with updated game and sets status to completed", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockGameUpdate.mockResolvedValue(fakeUpdatedGame);
    mockGameCount.mockResolvedValue(0); // all games in slate complete
    mockSlateUpdate.mockResolvedValue({ id: slateId, position: 1, status: "completed" });
    mockSlateFindFirst.mockResolvedValue(null); // no next slate

    const response = await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.homeScore).toBe(27);
    expect(body.awayScore).toBe(24);
    expect(body.status).toBe("completed");
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: gameId },
      data: { homeScore: 27, awayScore: 24, status: "completed" },
    });
  });

  it("accepts a score of zero", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockGameUpdate.mockResolvedValue({ ...fakeUpdatedGame, homeScore: 0, awayScore: 0 });
    mockGameCount.mockResolvedValue(1); // other games still pending

    const response = await PATCH(makeRequest({ homeScore: 0, awayScore: 0 }), fakeContext);

    expect(response.status).toBe(200);
  });

  it("triggers slate completion when all games in the slate are done", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockGameUpdate.mockResolvedValue(fakeUpdatedGame);
    mockGameCount.mockResolvedValue(0); // no incomplete games left
    mockSlateUpdate.mockResolvedValue({ id: slateId, position: 1, status: "completed" });
    mockSlateFindFirst.mockResolvedValue(null); // no next slate

    await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);

    expect(mockGameCount).toHaveBeenCalledWith({
      where: { slateId, NOT: { status: "completed" } },
    });
    expect(mockSlateUpdate).toHaveBeenCalledWith({
      where: { id: slateId },
      data: { status: "completed" },
    });
  });

  it("activates the next slate when the current slate completes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockGameUpdate.mockResolvedValue(fakeUpdatedGame);
    mockGameCount.mockResolvedValue(0);
    mockSlateUpdate
      .mockResolvedValueOnce({ id: slateId, position: 1, status: "completed" }) // current slate
      .mockResolvedValueOnce({ id: "slate-2", position: 2, status: "active" });  // next slate
    mockSlateFindFirst.mockResolvedValue({ id: "slate-2", leagueId, position: 2, status: "upcoming" });

    await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);

    expect(mockSlateFindFirst).toHaveBeenCalledWith({
      where: { leagueId, position: 2, status: "upcoming" },
    });
    expect(mockSlateUpdate).toHaveBeenCalledWith({
      where: { id: "slate-2" },
      data: { status: "active" },
    });
  });

  it("does not trigger slate promotion when game had no slate", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGame, slateId: null });
    mockGameUpdate.mockResolvedValue({ ...fakeUpdatedGame, slateId: null });

    await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);

    expect(mockGameCount).not.toHaveBeenCalled();
    expect(mockSlateUpdate).not.toHaveBeenCalled();
  });

  it("does not trigger slate promotion when game was already completed", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue({ ...fakeGame, status: "completed", homeScore: 10, awayScore: 7 });
    mockGameUpdate.mockResolvedValue(fakeUpdatedGame);

    await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);

    expect(mockGameCount).not.toHaveBeenCalled();
  });

  it("does not complete slate when incomplete games remain", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockGameFindUnique.mockResolvedValue(fakeGame);
    mockGameUpdate.mockResolvedValue(fakeUpdatedGame);
    mockGameCount.mockResolvedValue(2); // 2 games still pending

    await PATCH(makeRequest({ homeScore: 27, awayScore: 24 }), fakeContext);

    expect(mockSlateUpdate).not.toHaveBeenCalled();
  });
});
