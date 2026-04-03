import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findMany: vi.fn() },
    league: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { GET, POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.leagueMember.findMany as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/leagues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeLeague = {
  id: "league-1",
  name: "Office Pool",
  sport: "NFL",
  inviteCode: "abc123",
  createdById: "user-1",
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-01").toISOString(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/leagues
// ---------------------------------------------------------------------------

describe("POST /api/leagues", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makePostRequest({ name: "Office Pool", sport: "NFL" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when name is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    const response = await POST(makePostRequest({ sport: "NFL" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("League name is required");
  });

  it("returns 400 when sport is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    const response = await POST(makePostRequest({ name: "Office Pool" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Sport is required");
  });

  it("returns 400 when sport is not in the allowed list", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    const response = await POST(makePostRequest({ name: "Office Pool", sport: "CHESS" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Sport must be one of/);
  });

  it("returns 201 with the created league including sport", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        league: { create: vi.fn().mockResolvedValue(fakeLeague) },
        leagueMember: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });

    const response = await POST(makePostRequest({ name: "Office Pool", sport: "NFL" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.name).toBe("Office Pool");
    expect(body.sport).toBe("NFL");
    expect(body.id).toBe("league-1");
  });

  it("passes sport to the league create call", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });

    let capturedData: unknown;
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        league: {
          create: vi.fn().mockImplementation(({ data }: { data: unknown }) => {
            capturedData = data;
            return Promise.resolve(fakeLeague);
          }),
        },
        leagueMember: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });

    await POST(makePostRequest({ name: "Office Pool", sport: "NBA" }));

    expect(capturedData).toMatchObject({ name: "Office Pool", sport: "NBA" });
  });

  it("accepts all valid sports", async () => {
    const validSports = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"];

    for (const sport of validSports) {
      mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
      mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          league: { create: vi.fn().mockResolvedValue({ ...fakeLeague, sport }) },
          leagueMember: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const response = await POST(makePostRequest({ name: "Test League", sport }));
      expect(response.status).toBe(201);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/leagues
// ---------------------------------------------------------------------------

describe("GET /api/leagues", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns an empty array when the user has no memberships", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    mockFindMany.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns leagues with role, memberCount, and sport", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });

    mockFindMany.mockResolvedValue([
      {
        id: "mem-1",
        userId: "user-1",
        leagueId: "league-1",
        role: "admin",
        joinedAt: new Date("2026-01-01"),
        league: {
          id: "league-1",
          name: "Office Pool",
          sport: "NFL",
          inviteCode: "abc123",
          createdById: "user-1",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          _count: { members: 3 },
        },
      },
      {
        id: "mem-2",
        userId: "user-1",
        leagueId: "league-2",
        role: "member",
        joinedAt: new Date("2026-02-01"),
        league: {
          id: "league-2",
          name: "Friends League",
          sport: "NBA",
          inviteCode: "xyz789",
          createdById: "user-2",
          createdAt: new Date("2026-02-01"),
          updatedAt: new Date("2026-02-01"),
          _count: { members: 7 },
        },
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);

    expect(body[0]).toMatchObject({
      id: "league-1",
      name: "Office Pool",
      sport: "NFL",
      role: "admin",
      memberCount: 3,
    });

    expect(body[1]).toMatchObject({
      id: "league-2",
      name: "Friends League",
      sport: "NBA",
      role: "member",
      memberCount: 7,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        league: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
  });
});
