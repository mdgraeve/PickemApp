import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    sportGame: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/espn", () => ({
  fetchESPNSchedule: vi.fn(),
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fetchESPNSchedule } from "@/lib/espn";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.sportGame.findMany as ReturnType<typeof vi.fn>;
const mockCreateMany = prisma.sportGame.createMany as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.sportGame.update as ReturnType<typeof vi.fn>;
const mockFetchESPNSchedule = fetchESPNSchedule as ReturnType<typeof vi.fn>;

const ADMIN_EMAIL = "admin@example.com";

const adminSession = { user: { id: "user-1", email: ADMIN_EMAIL } };
const nonAdminSession = { user: { id: "user-2", email: "notadmin@example.com" } };

// Two fake ESPN games returned by the mocked fetchESPNSchedule
const fakeESPNGames = [
  {
    id: "espn-401547417",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Baltimore Ravens",
    scheduledAt: new Date("2026-09-07T00:20:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
  },
  {
    id: "espn-401547418",
    homeTeam: "Dallas Cowboys",
    awayTeam: "New York Giants",
    scheduledAt: new Date("2026-09-07T17:00:00Z"),
    status: "scheduled" as const,
    homeScore: null,
    awayScore: null,
  },
];

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/sync-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_ADMIN_EMAILS = ADMIN_EMAIL;
});

afterEach(() => {
  delete process.env.APP_ADMIN_EMAILS;
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe("POST /api/admin/sync-schedule — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns 403 when email is not in APP_ADMIN_EMAILS", async () => {
    mockGetSession.mockResolvedValue(nonAdminSession);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("returns 403 when APP_ADMIN_EMAILS is not set", async () => {
    delete process.env.APP_ADMIN_EMAILS;
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when APP_ADMIN_EMAILS is empty string", async () => {
    process.env.APP_ADMIN_EMAILS = "   ";
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when session email is null", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: null } });
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(403);
  });

  it("is case-insensitive when matching emails", async () => {
    process.env.APP_ADMIN_EMAILS = "ADMIN@EXAMPLE.COM";
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "admin@example.com" } });
    mockFetchESPNSchedule.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(200);
  });

  it("supports multiple emails in APP_ADMIN_EMAILS", async () => {
    process.env.APP_ADMIN_EMAILS = "first@example.com, second@example.com";
    mockGetSession.mockResolvedValue({ user: { id: "user-2", email: "second@example.com" } });
    mockFetchESPNSchedule.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("POST /api/admin/sync-schedule — validation", () => {
  it("returns 400 when sport is missing", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ date: "20260907" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("sport is required");
  });

  it("returns 400 when sport is not a valid sport key", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ sport: "GOLF", date: "20260907" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid sport/);
    expect(body.error).toMatch(/NFL/);
  });

  it("returns 400 when date is missing", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ sport: "NFL" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/date is required/);
  });

  it("returns 400 when date is not 8 digits", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const res = await POST(makeRequest({ sport: "NFL", date: "2026-09-07" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/YYYYMMDD/);
  });

  it("accepts all valid sport keys", async () => {
    const validSports = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"];
    for (const sport of validSports) {
      mockGetSession.mockResolvedValue(adminSession);
      mockFetchESPNSchedule.mockResolvedValue([]);
      mockFindMany.mockResolvedValue([]);
      const res = await POST(makeRequest({ sport, date: "20260907" }));
      expect(res.status).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// ESPN API errors
// ---------------------------------------------------------------------------

describe("POST /api/admin/sync-schedule — ESPN errors", () => {
  it("returns 502 when ESPN API throws", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockRejectedValue(
      new Error("ESPN API request failed: 503 Service Unavailable"),
    );
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/ESPN API error/);
    expect(body.error).toMatch(/503/);
  });

  it("returns 502 on non-Error ESPN throws with a generic message", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockRejectedValue("string error");
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    expect(res.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Upsert logic
// ---------------------------------------------------------------------------

describe("POST /api/admin/sync-schedule — upsert logic", () => {
  it("inserts all games when none exist yet", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    mockFindMany.mockResolvedValue([]); // nothing in DB yet
    mockCreateMany.mockResolvedValue({ count: 2 });

    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ inserted: 2, updated: 0 });
    expect(mockCreateMany).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("passes correct fields to createMany on insert (season derived from date)", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue([fakeESPNGames[0]]);
    mockFindMany.mockResolvedValue([]);
    mockCreateMany.mockResolvedValue({ count: 1 });

    await POST(makeRequest({ sport: "NFL", date: "20260907" }));

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sport: "NFL",
          season: "2026",
          homeTeam: "Kansas City Chiefs",
          awayTeam: "Baltimore Ravens",
          scheduledAt: fakeESPNGames[0].scheduledAt,
          espnId: "espn-401547417",
        }),
      ],
    });
  });

  it("updates existing games when all already exist (idempotency)", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    mockFindMany.mockResolvedValue([
      { espnId: "espn-401547417" },
      { espnId: "espn-401547418" },
    ]);
    mockUpdate.mockResolvedValue({});

    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ inserted: 0, updated: 2 });
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("passes correct fields to update for existing games", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue([fakeESPNGames[0]]);
    mockFindMany.mockResolvedValue([{ espnId: "espn-401547417" }]);
    mockUpdate.mockResolvedValue({});

    await POST(makeRequest({ sport: "NFL", date: "20260907" }));

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { espnId: "espn-401547417" },
      data: {
        homeTeam: "Kansas City Chiefs",
        awayTeam: "Baltimore Ravens",
        scheduledAt: fakeESPNGames[0].scheduledAt,
      },
    });
  });

  it("inserts new games and updates existing ones in the same call", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue(fakeESPNGames);
    mockFindMany.mockResolvedValue([{ espnId: "espn-401547417" }]); // only first exists
    mockCreateMany.mockResolvedValue({ count: 1 });
    mockUpdate.mockResolvedValue({});

    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ inserted: 1, updated: 1 });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ espnId: "espn-401547418" })],
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { espnId: "espn-401547417" } }),
    );
  });

  it("returns 0/0 and skips DB calls when ESPN returns no games", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockFetchESPNSchedule.mockResolvedValue([]);
    const res = await POST(makeRequest({ sport: "NFL", date: "20260907" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ inserted: 0, updated: 0 });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
