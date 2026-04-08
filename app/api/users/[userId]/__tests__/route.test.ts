import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    pick: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindFirst = prisma.leagueMember.findFirst as ReturnType<typeof vi.fn>;
const mockMemberFindMany = prisma.leagueMember.findMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockPickFindMany = prisma.pick.findMany as ReturnType<typeof vi.fn>;

const targetUserId = "user-2";
const requesterId = "user-1";
const fakeRequest = new Request(`http://localhost/api/users/${targetUserId}`);
const fakeContext = { params: Promise.resolve({ userId: targetUserId }) };

const fakeUser = {
  id: targetUserId,
  name: "Bob",
  createdAt: new Date("2026-01-01"),
};

function setupAuthorized() {
  mockGetSession.mockResolvedValue({ user: { id: requesterId } });
  mockMemberFindFirst.mockResolvedValue({ id: "mem-1" });
  mockUserFindUnique.mockResolvedValue(fakeUser);
  mockMemberFindMany.mockResolvedValue([]);
  mockPickFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/users/[userId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when requester shares no league with target", async () => {
    mockGetSession.mockResolvedValue({ user: { id: requesterId } });
    mockMemberFindFirst.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("skips the shared-league check when requester is the target", async () => {
    const selfContext = { params: Promise.resolve({ userId: requesterId }) };
    mockGetSession.mockResolvedValue({ user: { id: requesterId } });
    mockUserFindUnique.mockResolvedValue({ ...fakeUser, id: requesterId });
    mockMemberFindMany.mockResolvedValue([]);
    mockPickFindMany.mockResolvedValue([]);
    const res = await GET(fakeRequest, selfContext);
    expect(res.status).toBe(200);
    // findFirst should not have been called for self-view
    expect(mockMemberFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when target user does not exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: requesterId } });
    mockMemberFindFirst.mockResolvedValue({ id: "mem-1" });
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");
  });

  it("returns profile data without email", async () => {
    setupAuthorized();
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(targetUserId);
    expect(body.name).toBe("Bob");
    expect(body.email).toBeUndefined();
    expect(body.stats).toEqual([]);
    expect(body.pickHistory).toEqual([]);
  });

  it("computes per-league stats correctly", async () => {
    mockGetSession.mockResolvedValue({ user: { id: requesterId } });
    mockMemberFindFirst.mockResolvedValue({ id: "mem-1" });
    mockUserFindUnique.mockResolvedValue(fakeUser);
    mockPickFindMany.mockResolvedValue([]);
    mockMemberFindMany.mockResolvedValue([
      {
        league: {
          id: "league-1",
          name: "Test League",
          sport: "NFL",
          games: [
            {
              homeTeam: "Chiefs",
              awayTeam: "Eagles",
              homeScore: 30,
              awayScore: 20,
              picks: [{ pickedTeam: "Chiefs" }], // correct
            },
            {
              homeTeam: "Bills",
              awayTeam: "Ravens",
              homeScore: 10,
              awayScore: 17,
              picks: [{ pickedTeam: "Bills" }], // wrong
            },
            {
              homeTeam: "Packers",
              awayTeam: "Bears",
              homeScore: 21,
              awayScore: 21,
              picks: [{ pickedTeam: "Packers" }], // tie — not counted as correct
            },
          ],
        },
      },
    ]);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stats).toHaveLength(1);
    expect(body.stats[0]).toMatchObject({
      leagueId: "league-1",
      leagueName: "Test League",
      sport: "NFL",
      correctPicks: 1,
      totalPicks: 3,
      accuracy: 33,
    });
  });

  it("includes pick history with isCorrect flag", async () => {
    mockGetSession.mockResolvedValue({ user: { id: requesterId } });
    mockMemberFindFirst.mockResolvedValue({ id: "mem-1" });
    mockUserFindUnique.mockResolvedValue(fakeUser);
    mockMemberFindMany.mockResolvedValue([]);
    mockPickFindMany.mockResolvedValue([
      {
        pickedTeam: "Chiefs",
        game: {
          id: "game-1",
          leagueId: "league-1",
          homeTeam: "Chiefs",
          awayTeam: "Eagles",
          startTime: new Date("2026-01-01"),
          homeScore: 30,
          awayScore: 20,
          status: "completed",
          slate: { name: "Week 1" },
          league: { name: "Test League" },
        },
      },
    ]);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pickHistory).toHaveLength(1);
    expect(body.pickHistory[0]).toMatchObject({
      gameId: "game-1",
      pickedTeam: "Chiefs",
      isCorrect: true,
      slateName: "Week 1",
      leagueName: "Test League",
    });
  });
});
