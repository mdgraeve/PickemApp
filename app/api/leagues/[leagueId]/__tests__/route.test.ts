import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}`);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const fakeLeague = {
  id: leagueId,
  name: "Test League",
  sport: "NFL",
  inviteCode: "invite-abc",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  _count: { members: 3 },
};

const fakeMembership = {
  id: "mem-1",
  userId: "user-1",
  leagueId,
  role: "admin",
  joinedAt: new Date("2026-01-01"),
  league: fakeLeague,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/leagues/[leagueId]", () => {
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

  it("returns league details and user role", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe(leagueId);
    expect(body.name).toBe("Test League");
    expect(body.sport).toBe("NFL");
    expect(body.inviteCode).toBe("invite-abc");
    expect(body.role).toBe("admin");
    expect(body.memberCount).toBe(3);
  });

  it("returns member role for non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "b@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...fakeMembership, role: "member" });

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.role).toBe("member");
  });

  it("queries membership with league and member count included", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(fakeMembership);

    await GET(fakeRequest, fakeContext);

    expect(mockMemberFindUnique).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: "user-1", leagueId } },
      include: {
        league: {
          include: { _count: { select: { members: true } } },
        },
      },
    });
  });
});
