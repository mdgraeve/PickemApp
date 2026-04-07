import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: {
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { PATCH, DELETE } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockMemberCount = prisma.leagueMember.count as ReturnType<typeof vi.fn>;
const mockMemberUpdate = prisma.leagueMember.update as ReturnType<typeof vi.fn>;
const mockMemberDelete = prisma.leagueMember.delete as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const targetUserId = "user-2";
const fakeContext = { params: Promise.resolve({ leagueId, userId: targetUserId }) };

const requesterAdmin = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const requesterMember = { id: "mem-1", userId: "user-1", leagueId, role: "member" };
const targetMember = { id: "mem-2", userId: targetUserId, leagueId, role: "member" };
const targetAdmin = { id: "mem-2", userId: targetUserId, leagueId, role: "admin" };

function makePatchRequest(body: unknown) {
  return new Request(`http://localhost/api/leagues/${leagueId}/members/${targetUserId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeDeleteRequest = new Request(
  `http://localhost/api/leagues/${leagueId}/members/${targetUserId}`,
  { method: "DELETE" },
);

beforeEach(() => {
  vi.resetAllMocks();
  // Default: requester is admin when findUnique is called first
  mockMemberFindUnique
    .mockResolvedValueOnce(requesterAdmin)  // requester membership check
    .mockResolvedValueOnce(targetMember);   // target membership check
  mockMemberCount.mockResolvedValue(2); // multiple admins by default
});

// ---------------------------------------------------------------------------
// PATCH /api/leagues/[leagueId]/members/[userId]
// ---------------------------------------------------------------------------

describe("PATCH /api/leagues/[leagueId]/members/[userId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await PATCH(makePatchRequest({ role: "admin" }), fakeContext);
    expect(response.status).toBe(401);
  });

  it("returns 403 when requester is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique.mockResolvedValue(null);
    const response = await PATCH(makePatchRequest({ role: "admin" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when requester is a member but not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique.mockResolvedValue(requesterMember);
    const response = await PATCH(makePatchRequest({ role: "admin" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can change member roles");
  });

  it("returns 404 when target user is not a member of the league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(null);
    const response = await PATCH(makePatchRequest({ role: "admin" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe("Member not found");
  });

  it("returns 400 when role is an invalid value", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    const response = await PATCH(makePatchRequest({ role: "superuser" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("role must be 'admin' or 'member'");
  });

  it("returns 400 when demoting the sole admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(targetAdmin);
    mockMemberCount.mockResolvedValue(1); // only one admin
    const response = await PATCH(makePatchRequest({ role: "member" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot demote the only admin of a league");
  });

  it("promotes a member to admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    const updated = { ...targetMember, role: "admin" };
    mockMemberUpdate.mockResolvedValue(updated);
    const response = await PATCH(makePatchRequest({ role: "admin" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.role).toBe("admin");
    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: targetUserId, leagueId } },
      data: { role: "admin" },
    });
  });

  it("demotes an admin to member when multiple admins exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(targetAdmin);
    mockMemberCount.mockResolvedValue(2); // two admins
    mockMemberUpdate.mockResolvedValue({ ...targetAdmin, role: "member" });
    const response = await PATCH(makePatchRequest({ role: "member" }), fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.role).toBe("member");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/leagues/[leagueId]/members/[userId]
// ---------------------------------------------------------------------------

describe("DELETE /api/leagues/[leagueId]/members/[userId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    expect(response.status).toBe(401);
  });

  it("returns 403 when requester is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique.mockResolvedValue(null);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when requester is a member but not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique.mockResolvedValue(requesterMember);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can remove members");
  });

  it("returns 404 when target is not a member of the league", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(null);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe("Member not found");
  });

  it("returns 400 when removing the sole admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(targetAdmin);
    mockMemberCount.mockResolvedValue(1);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot remove the only admin of a league");
  });

  it("removes a member successfully", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberDelete.mockResolvedValue(targetMember);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockMemberDelete).toHaveBeenCalledWith({
      where: { userId_leagueId: { userId: targetUserId, leagueId } },
    });
  });

  it("removes an admin when multiple admins exist", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockReset();
    mockMemberFindUnique
      .mockResolvedValueOnce(requesterAdmin)
      .mockResolvedValueOnce(targetAdmin);
    mockMemberCount.mockResolvedValue(2);
    mockMemberDelete.mockResolvedValue(targetAdmin);
    const response = await DELETE(fakeDeleteRequest, fakeContext);
    expect(response.status).toBe(200);
  });
});
