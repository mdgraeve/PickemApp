import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    league: { update: vi.fn(), delete: vi.fn() },
    slate: { count: vi.fn() },
  },
}));

import { GET, PATCH, DELETE } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockLeagueUpdate = prisma.league.update as ReturnType<typeof vi.fn>;
const mockLeagueDelete = prisma.league.delete as ReturnType<typeof vi.fn>;
const mockSlateCount = prisma.slate.count as ReturnType<typeof vi.fn>;

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

const adminMembership = {
  id: "mem-1",
  userId: "user-1",
  leagueId,
  role: "admin",
  joinedAt: new Date("2026-01-01"),
  league: fakeLeague,
};

const memberMembership = { ...adminMembership, role: "member" };

function makePatchRequest(body: unknown) {
  return new Request(`http://localhost/api/leagues/${leagueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSlateCount.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// GET /api/leagues/[leagueId]
// ---------------------------------------------------------------------------

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
    mockMemberFindUnique.mockResolvedValue(adminMembership);
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
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.role).toBe("member");
  });

  it("queries membership with league and member count included", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    await GET(fakeRequest, fakeContext);
    expect(mockMemberFindUnique).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: "user-1", leagueId } },
      include: { league: { include: { _count: { select: { members: true } } } } },
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/leagues/[leagueId]
// ---------------------------------------------------------------------------

describe("PATCH /api/leagues/[leagueId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await PATCH(makePatchRequest({ name: "New Name" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);
    const response = await PATCH(makePatchRequest({ name: "New Name" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is a member but not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...memberMembership, league: undefined });
    const response = await PATCH(makePatchRequest({ name: "New Name" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can update league settings");
  });

  it("returns 400 when no valid fields are provided", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    const response = await PATCH(makePatchRequest({}), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("No valid fields to update");
  });

  it("returns 400 when name is an empty string", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    const response = await PATCH(makePatchRequest({ name: "  " }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("name cannot be empty");
  });

  it("returns 400 when sport is not a valid value", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    const response = await PATCH(makePatchRequest({ sport: "CRICKET" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/sport must be one of/);
  });

  it("returns 400 when trying to change sport after slates exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    mockSlateCount.mockResolvedValue(2);
    const response = await PATCH(makePatchRequest({ sport: "NBA" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot change sport after slates have been created");
  });

  it("renames the league successfully", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    mockLeagueUpdate.mockResolvedValue({ ...fakeLeague, name: "New Name" });
    const response = await PATCH(makePatchRequest({ name: "New Name" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.name).toBe("New Name");
    expect(mockLeagueUpdate).toHaveBeenCalledWith({
      where: { id: leagueId },
      data: { name: "New Name" },
    });
  });

  it("updates sport when no slates exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    mockSlateCount.mockResolvedValue(0);
    mockLeagueUpdate.mockResolvedValue({ ...fakeLeague, sport: "NBA" });
    const response = await PATCH(makePatchRequest({ sport: "NBA" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sport).toBe("NBA");
  });

  it("can update name and sport together", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    mockSlateCount.mockResolvedValue(0);
    mockLeagueUpdate.mockResolvedValue({ ...fakeLeague, name: "New Name", sport: "NBA" });
    const response = await PATCH(makePatchRequest({ name: "New Name", sport: "NBA" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mockLeagueUpdate).toHaveBeenCalledWith({
      where: { id: leagueId },
      data: { name: "New Name", sport: "NBA" },
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/leagues/[leagueId]
// ---------------------------------------------------------------------------

const fakeDeleteRequest = new Request(`http://localhost/api/leagues/${leagueId}`, {
  method: "DELETE",
});

describe("DELETE /api/leagues/[leagueId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is a member but not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...memberMembership, league: undefined });
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can delete a league");
  });

  it("deletes the league and returns success for admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue({ ...adminMembership, league: undefined });
    mockLeagueDelete.mockResolvedValue(fakeLeague);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockLeagueDelete).toHaveBeenCalledWith({ where: { id: leagueId } });
  });
});
