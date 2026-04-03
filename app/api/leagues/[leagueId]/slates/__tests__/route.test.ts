import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { GET, POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindMany = prisma.slate.findMany as ReturnType<typeof vi.fn>;
const mockSlateCreate = prisma.slate.create as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/slates`);
const fakeContext = { params: Promise.resolve({ leagueId }) };

const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };

function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/leagues/${leagueId}/slates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeSlate = {
  id: "slate-1",
  leagueId,
  name: "Week 1",
  position: 1,
  status: "upcoming",
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-01"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/leagues/[leagueId]/slates
// ---------------------------------------------------------------------------

describe("GET /api/leagues/[leagueId]/slates", () => {
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

  it("returns an empty array when the league has no slates", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindMany.mockResolvedValue([]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns slates with gameCount ordered by position", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindMany.mockResolvedValue([
      { ...fakeSlate, _count: { games: 5 } },
      { ...fakeSlate, id: "slate-2", name: "Week 2", position: 2, status: "upcoming", _count: { games: 0 } },
    ]);

    const response = await GET(fakeRequest, fakeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: "slate-1", name: "Week 1", position: 1, gameCount: 5 });
    expect(body[1]).toMatchObject({ id: "slate-2", name: "Week 2", position: 2, gameCount: 0 });

    expect(mockSlateFindMany).toHaveBeenCalledWith({
      where: { leagueId },
      include: { _count: { select: { games: true } } },
      orderBy: { position: "asc" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/leagues/[leagueId]/slates
// ---------------------------------------------------------------------------

describe("POST /api/leagues/[leagueId]/slates", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makePostRequest({ name: "Week 1", position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(null);

    const response = await POST(makePostRequest({ name: "Week 1", position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is a member but not an admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "b@b.com" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);

    const response = await POST(makePostRequest({ name: "Week 1", position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only league admins can create slates");
  });

  it("returns 400 when name is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await POST(makePostRequest({ position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Slate name is required");
  });

  it("returns 400 when position is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await POST(makePostRequest({ name: "Week 1" }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("position must be a positive integer");
  });

  it("returns 400 when position is not a positive integer", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);

    const response = await POST(makePostRequest({ name: "Week 1", position: -1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("position must be a positive integer");
  });

  it("returns 409 when a slate at that position already exists", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateCreate.mockRejectedValue({ code: "P2002" });

    const response = await POST(makePostRequest({ name: "Week 1", position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/position 1 already exists/);
  });

  it("returns 201 with the created slate", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateCreate.mockResolvedValue(fakeSlate);

    const response = await POST(makePostRequest({ name: "Week 1", position: 1 }), fakeContext);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.name).toBe("Week 1");
    expect(body.position).toBe(1);
    expect(body.status).toBe("upcoming");
    expect(mockSlateCreate).toHaveBeenCalledWith({
      data: { leagueId, name: "Week 1", position: 1 },
    });
  });
});
