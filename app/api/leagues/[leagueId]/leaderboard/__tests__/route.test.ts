import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn(), findMany: vi.fn() },
    game: { findMany: vi.fn() },
    slate: { findUnique: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockMemberFindMany = prisma.leagueMember.findMany as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;
const mockSlateFindUnique = prisma.slate.findUnique as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const slateId = "slate-1";

const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/leaderboard`);
const fakeRequestWithSlate = new Request(
  `http://localhost/api/leagues/${leagueId}/leaderboard?slateId=${slateId}`,
);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const fakeMembership = { id: "mem-1", userId: "user-1", leagueId, role: "member" };
const fakeSlate = { id: slateId, leagueId, name: "Week 1", position: 1, status: "completed" };

const fakeMembers = [
  {
    id: "mem-1",
    userId: "user-1",
    leagueId,
    role: "member",
    user: { id: "user-1", name: "Alice", email: "alice@b.com" },
  },
  {
    id: "mem-2",
    userId: "user-2",
    leagueId,
    role: "member",
    user: { id: "user-2", name: "Bob", email: "bob@b.com" },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Overall leaderboard (no slateId)
// ---------------------------------------------------------------------------

describe("GET /api/leagues/[leagueId]/leaderboard (overall)", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockMemberFindUnique).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: "user-1", leagueId } },
    });
  });

  it("returns an empty array when the league has no members", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue([]);
    mockGameFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns all members with correct:0 when there are no completed games", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].correct).toBe(0);
    expect(body[1].correct).toBe(0);
  });

  it("returns all members with correct:0 when completed games have no picks", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      { id: "game-1", homeTeam: "Team A", awayTeam: "Team B", homeScore: 3, awayScore: 1, picks: [] },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    body.forEach((entry: { correct: number; totalPicks: number }) => {
      expect(entry.correct).toBe(0);
      expect(entry.totalPicks).toBe(0);
    });
  });

  it("counts a correct pick and not an incorrect pick", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      {
        id: "game-1",
        homeTeam: "Team A",
        awayTeam: "Team B",
        homeScore: 3,
        awayScore: 1,
        picks: [
          { userId: "user-1", pickedTeam: "Team A" },
          { userId: "user-2", pickedTeam: "Team B" },
        ],
      },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    const alice = body.find((e: { userId: string }) => e.userId === "user-1");
    const bob = body.find((e: { userId: string }) => e.userId === "user-2");
    expect(alice.correct).toBe(1);
    expect(bob.correct).toBe(0);
  });

  it("does not award a correct pick for a tied game", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      {
        id: "game-1",
        homeTeam: "Team A",
        awayTeam: "Team B",
        homeScore: 2,
        awayScore: 2,
        picks: [
          { userId: "user-1", pickedTeam: "Team A" },
          { userId: "user-2", pickedTeam: "Team B" },
        ],
      },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    body.forEach((entry: { correct: number }) => expect(entry.correct).toBe(0));
  });

  it("skips a completed game where scores are null", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      { id: "game-1", homeTeam: "Team A", awayTeam: "Team B", homeScore: null, awayScore: null, picks: [{ userId: "user-1", pickedTeam: "Team A" }] },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    const alice = body.find((e: { userId: string }) => e.userId === "user-1");
    expect(alice.correct).toBe(0);
    expect(alice.totalPicks).toBe(0);
  });

  it("applies dense ranking so tied users share a rank", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue([
      ...fakeMembers,
      { id: "mem-3", userId: "user-3", leagueId, role: "member", user: { id: "user-3", name: "Carol", email: "carol@b.com" } },
    ]);
    mockGameFindMany.mockResolvedValue([
      {
        id: "game-1",
        homeTeam: "Team A",
        awayTeam: "Team B",
        homeScore: 3,
        awayScore: 1,
        picks: [
          { userId: "user-1", pickedTeam: "Team A" },
          { userId: "user-2", pickedTeam: "Team A" },
          { userId: "user-3", pickedTeam: "Team B" },
        ],
      },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    const alice = body.find((e: { userId: string }) => e.userId === "user-1");
    const bob = body.find((e: { userId: string }) => e.userId === "user-2");
    const carol = body.find((e: { userId: string }) => e.userId === "user-3");
    expect(alice.rank).toBe(1);
    expect(bob.rank).toBe(1);
    expect(carol.rank).toBe(2);
  });

  it("includes a user with zero picks at the bottom", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      {
        id: "game-1",
        homeTeam: "Team A",
        awayTeam: "Team B",
        homeScore: 3,
        awayScore: 1,
        picks: [{ userId: "user-1", pickedTeam: "Team A" }],
      },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    const bob = body.find((e: { userId: string }) => e.userId === "user-2");
    expect(bob.correct).toBe(0);
    expect(bob.rank).toBe(2);
  });

  it("queries all completed games in the league when no slateId given", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([]);

    await GET(fakeRequest, fakeContext);

    expect(mockGameFindMany).toHaveBeenCalledWith({
      where: { leagueId, status: "completed" },
      select: expect.any(Object),
    });
    expect(mockSlateFindUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-slate leaderboard (?slateId=)
// ---------------------------------------------------------------------------

describe("GET /api/leagues/[leagueId]/leaderboard?slateId=", () => {
  it("returns 404 when the slateId does not exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindUnique.mockResolvedValue(null);

    const response = await GET(fakeRequestWithSlate, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Slate not found");
  });

  it("returns 404 when the slate belongs to a different league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindUnique.mockResolvedValue({ ...fakeSlate, leagueId: "other-league" });

    const response = await GET(fakeRequestWithSlate, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Slate not found");
  });

  it("queries only completed games in the specified slate", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([]);

    await GET(fakeRequestWithSlate, fakeContext);

    expect(mockGameFindMany).toHaveBeenCalledWith({
      where: { leagueId, status: "completed", slateId },
      select: expect.any(Object),
    });
  });

  it("scores only picks for games in the specified slate", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([
      {
        id: "game-1",
        homeTeam: "Chiefs",
        awayTeam: "Ravens",
        homeScore: 27,
        awayScore: 24,
        picks: [
          { userId: "user-1", pickedTeam: "Chiefs" },  // correct
          { userId: "user-2", pickedTeam: "Ravens" },  // incorrect
        ],
      },
    ]);

    const response = await GET(fakeRequestWithSlate, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    const alice = body.find((e: { userId: string }) => e.userId === "user-1");
    const bob = body.find((e: { userId: string }) => e.userId === "user-2");
    expect(alice.correct).toBe(1);
    expect(alice.rank).toBe(1);
    expect(bob.correct).toBe(0);
    expect(bob.rank).toBe(2);
  });

  it("returns all members with correct:0 when the slate has no completed games", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "alice@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    mockGameFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequestWithSlate, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    body.forEach((entry: { correct: number }) => expect(entry.correct).toBe(0));
  });
});
