import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockMemberFindMany = prisma.leagueMember.findMany as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/members`);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };

const fakeMembers = [
  {
    id: "mem-1",
    userId: "user-1",
    leagueId,
    role: "admin",
    joinedAt: new Date("2026-01-01"),
    user: { id: "user-1", name: "Alice", email: "alice@example.com" },
  },
  {
    id: "mem-2",
    userId: "user-2",
    leagueId,
    role: "member",
    joinedAt: new Date("2026-01-02"),
    user: { id: "user-2", name: null, email: "bob@example.com" },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/leagues/[leagueId]/members", () => {
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

  it("returns 403 when user is a member but not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "b@b.com" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can view the member list");
  });

  it("returns flattened member list with user details", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ userId: "user-1", role: "admin", name: "Alice", email: "alice@example.com" });
    expect(body[1]).toMatchObject({ userId: "user-2", role: "member", name: null, email: "bob@example.com" });
  });

  it("queries members ordered by joinedAt ascending", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockMemberFindMany.mockResolvedValue(fakeMembers);
    await GET(fakeRequest, fakeContext);
    expect(mockMemberFindMany).toHaveBeenCalledWith({
      where: { leagueId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    });
  });
});
