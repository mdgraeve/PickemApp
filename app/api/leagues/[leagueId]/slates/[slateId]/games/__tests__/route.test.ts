import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    sportGame: { findMany: vi.fn() },
    game: { createMany: vi.fn(), findMany: vi.fn() },
  },
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindUnique = prisma.slate.findUnique as ReturnType<typeof vi.fn>;
const mockLeagueFindUnique = prisma.league.findUnique as ReturnType<typeof vi.fn>;
const mockSportGameFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;
const mockGameCreateMany = prisma.game.createMany as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const slateId = "slate-1";
const fakeContext = { params: Promise.resolve({ leagueId, slateId }) };

const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };

const fakeSlate = { id: slateId, leagueId, name: "Week 1", position: 1, status: "upcoming" };
const fakeLeague = { id: leagueId, name: "Test League", sport: "NFL" };

const fakeSportGames = [
  {
    id: "sg-1",
    sport: "NFL",
    homeTeam: "Chiefs",
    awayTeam: "Ravens",
    scheduledAt: new Date("2026-09-06T20:20:00Z"),
    season: "2026",
  },
  {
    id: "sg-2",
    sport: "NFL",
    homeTeam: "Cowboys",
    awayTeam: "Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    season: "2026",
  },
];

const fakeCreatedGames = [
  {
    id: "game-1",
    leagueId,
    slateId,
    homeTeam: "Chiefs",
    awayTeam: "Ravens",
    startTime: new Date("2026-09-06T20:20:00Z"),
    homeScore: null,
    awayScore: null,
    status: "scheduled",
  },
  {
    id: "game-2",
    leagueId,
    slateId,
    homeTeam: "Cowboys",
    awayTeam: "Giants",
    startTime: new Date("2026-09-07T17:00:00Z"),
    homeScore: null,
    awayScore: null,
    status: "scheduled",
  },
];

function makeRequest(body: unknown) {
  return new Request(
    `http://localhost/api/leagues/${leagueId}/slates/${slateId}/games`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/leagues/[leagueId]/slates/[slateId]/games", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is a member but not an admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "b@b.com" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can add games to a slate");
  });

  it("returns 400 when sportGameIds is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await POST(makeRequest({}), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("sportGameIds must be a non-empty array");
  });

  it("returns 400 when sportGameIds is an empty array", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await POST(makeRequest({ sportGameIds: [] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("sportGameIds must be a non-empty array");
  });

  it("returns 404 when slate does not exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Slate not found");
  });

  it("returns 404 when slate belongs to a different league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue({ ...fakeSlate, leagueId: "other-league" });

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Slate not found");
  });

  it("returns 400 when a sportGameId is not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockLeagueFindUnique.mockResolvedValue(fakeLeague);
    mockSportGameFindMany.mockResolvedValue([fakeSportGames[0]]); // only 1 of 2 found

    const response = await POST(makeRequest({ sportGameIds: ["sg-1", "sg-missing"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("One or more sportGameIds were not found");
  });

  it("returns 400 when a sport game does not match the league sport", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockLeagueFindUnique.mockResolvedValue(fakeLeague); // NFL league
    mockSportGameFindMany.mockResolvedValue([
      { ...fakeSportGames[0], sport: "NBA" }, // wrong sport
    ]);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/NBA game but this league is NFL/);
  });

  it("creates games and returns 201 on success", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockLeagueFindUnique.mockResolvedValue(fakeLeague);
    mockSportGameFindMany.mockResolvedValue(fakeSportGames);
    mockGameCreateMany.mockResolvedValue({ count: 2 });
    mockGameFindMany.mockResolvedValue(fakeCreatedGames);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1", "sg-2"] }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toHaveLength(2);
    expect(body[0].homeTeam).toBe("Chiefs");
    expect(body[1].homeTeam).toBe("Cowboys");
  });

  it("maps SportGame fields to Game fields correctly", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockLeagueFindUnique.mockResolvedValue(fakeLeague);
    mockSportGameFindMany.mockResolvedValue([fakeSportGames[0]]);
    mockGameCreateMany.mockResolvedValue({ count: 1 });
    mockGameFindMany.mockResolvedValue([fakeCreatedGames[0]]);

    await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);

    expect(mockGameCreateMany).toHaveBeenCalledWith({
      data: [
        {
          leagueId,
          slateId,
          homeTeam: "Chiefs",
          awayTeam: "Ravens",
          startTime: fakeSportGames[0].scheduledAt,
          status: "scheduled",
        },
      ],
    });
  });

  it("skips sport check when league has no sport set", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockLeagueFindUnique.mockResolvedValue({ ...fakeLeague, sport: null });
    mockSportGameFindMany.mockResolvedValue([{ ...fakeSportGames[0], sport: "NBA" }]);
    mockGameCreateMany.mockResolvedValue({ count: 1 });
    mockGameFindMany.mockResolvedValue([fakeCreatedGames[0]]);

    const response = await POST(makeRequest({ sportGameIds: ["sg-1"] }), fakeContext);

    expect(response.status).toBe(201);
  });
});
