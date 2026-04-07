import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    sportGame: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockSportGameFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;

const fakeSportGames = [
  {
    id: "sg-1",
    sport: "NFL",
    homeTeam: "Chiefs",
    awayTeam: "Ravens",
    scheduledAt: new Date("2026-09-06T20:20:00Z"),
    season: "2026",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "sg-2",
    sport: "NFL",
    homeTeam: "Cowboys",
    awayTeam: "Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    season: "2026",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/sport-games", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/sport-games?sport=NFL"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when sport param is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    const response = await GET(new Request("http://localhost/api/sport-games"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("sport query param is required");
  });

  it("returns sport games filtered by sport", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockSportGameFindMany.mockResolvedValue(fakeSportGames);

    const response = await GET(new Request("http://localhost/api/sport-games?sport=NFL"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].homeTeam).toBe("Chiefs");
    expect(mockSportGameFindMany).toHaveBeenCalledWith({
      where: { sport: "NFL" },
      orderBy: { scheduledAt: "asc" },
    });
  });

  it("filters by season when provided", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockSportGameFindMany.mockResolvedValue([fakeSportGames[0]]);

    const response = await GET(
      new Request("http://localhost/api/sport-games?sport=NFL&season=2026"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSportGameFindMany).toHaveBeenCalledWith({
      where: { sport: "NFL", season: "2026" },
      orderBy: { scheduledAt: "asc" },
    });
    expect(body).toHaveLength(1);
  });

  it("returns empty array when no games match", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockSportGameFindMany.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/sport-games?sport=NBA"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });
});
