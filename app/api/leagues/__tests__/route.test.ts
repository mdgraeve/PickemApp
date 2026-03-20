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

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.leagueMember.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
});

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

  it("returns leagues with role and memberCount", async () => {
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
      role: "admin",
      memberCount: 3,
    });

    expect(body[1]).toMatchObject({
      id: "league-2",
      name: "Friends League",
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
