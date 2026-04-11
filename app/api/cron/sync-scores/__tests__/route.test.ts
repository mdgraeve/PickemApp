import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/espn", () => ({
  fetchESPNScoreboard: vi.fn(),
}));

// Full prisma mock with every method used by the route + tryPromoteNextSlate
vi.mock("@/lib/db", () => ({
  prisma: {
    slate: {
      findMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    game: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { POST } from "../route";
import { prisma } from "@/lib/db";
import { fetchESPNScoreboard } from "@/lib/espn";

const mockSlateFindMany = prisma.slate.findMany as ReturnType<typeof vi.fn>;
const mockSlateUpdate = prisma.slate.update as ReturnType<typeof vi.fn>;
const mockSlateFindFirst = prisma.slate.findFirst as ReturnType<typeof vi.fn>;
const mockGameFindMany = prisma.game.findMany as ReturnType<typeof vi.fn>;
const mockGameCount = prisma.game.count as ReturnType<typeof vi.fn>;
const mockGameUpdate = prisma.game.update as ReturnType<typeof vi.fn>;
const mockFetchESPNScoreboard = fetchESPNScoreboard as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CRON_SECRET = "test-secret-xyz";

function makeRequest(secret?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== undefined) headers["x-cron-secret"] = secret;
  return new Request("http://localhost/api/cron/sync-scores", {
    method: "POST",
    headers,
  });
}

const completedESPNGame = {
  id: "espn-401547417",
  homeTeam: "Kansas City Chiefs",
  awayTeam: "Baltimore Ravens",
  scheduledAt: new Date("2026-09-07T00:20:00Z"),
  status: "completed" as const,
  homeScore: 27,
  awayScore: 20,
  clock: null,
  period: null,
  shortDetail: null,
};

const inProgressESPNGame = {
  id: "espn-401547418",
  homeTeam: "Dallas Cowboys",
  awayTeam: "New York Giants",
  scheduledAt: new Date("2026-09-07T17:00:00Z"),
  status: "in_progress" as const,
  homeScore: 14,
  awayScore: 7,
  clock: "8:32",
  period: 2,
  shortDetail: "2nd - 8:32",
};

const scheduledESPNGame = {
  id: "espn-401547419",
  homeTeam: "San Francisco 49ers",
  awayTeam: "Los Angeles Rams",
  scheduledAt: new Date("2026-09-07T20:25:00Z"),
  status: "scheduled" as const,
  homeScore: null,
  awayScore: null,
  clock: null,
  period: null,
  shortDetail: null,
};

// A lean active slate fixture
const activeNFLSlate = {
  id: "slate-1",
  leagueId: "league-1",
  position: 1,
  status: "active",
  league: { sport: "NFL" },
};

// A game row in the DB linked to completedESPNGame
const dbGame = {
  id: "game-1",
  leagueId: "league-1",
  slateId: "slate-1",
  espnGameId: "espn-401547417",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;

  // Default: no active slates (overridden in individual tests)
  mockSlateFindMany.mockResolvedValue([]);
  mockGameFindMany.mockResolvedValue([]);
  mockGameCount.mockResolvedValue(0);
  mockSlateUpdate.mockResolvedValue({ id: "slate-1", position: 1 });
  mockSlateFindFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — auth", () => {
  it("returns 401 when x-cron-secret header is missing", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns 401 when x-cron-secret value is wrong", async () => {
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest(CRON_SECRET));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// No active slates
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — no active slates", () => {
  it("returns 200 with zeroed summary when there are no active slates", async () => {
    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ synced: 0, updated: 0, sports: [] });
    expect(mockFetchESPNScoreboard).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Score writes
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — score writes", () => {
  it("updates completed games with correct scores and status", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([dbGame]);
    mockGameUpdate.mockResolvedValue({ ...dbGame, status: "completed", homeScore: 27, awayScore: 20 });

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(1);
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { homeScore: 27, awayScore: 20, status: "completed" },
    });
  });

  it("does not update in-progress games", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([inProgressESPNGame]);
    // No DB game matches scheduled game either
    mockGameFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(0);
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it("does not update scheduled games", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([scheduledESPNGame]);
    mockGameFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(body.updated).toBe(0);
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it("skips games without espnGameId (no matching DB rows)", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([]); // no matches

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(body.updated).toBe(0);
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it("skips a DB game that is already completed (idempotency)", async () => {
    const alreadyCompleted = { ...dbGame, status: "completed", homeScore: 27, awayScore: 20 };
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([alreadyCompleted]);

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(body.updated).toBe(0);
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent — calling twice with the same data produces no extra updates", async () => {
    // First call
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([dbGame]);
    mockGameUpdate.mockResolvedValue({ ...dbGame, status: "completed" });

    await POST(makeRequest(CRON_SECRET));
    expect(mockGameUpdate).toHaveBeenCalledTimes(1); // 1 from game, 1 from slate = 2

    // Second call — game is now already completed
    vi.resetAllMocks();
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([{ ...dbGame, status: "completed" }]);
    mockGameCount.mockResolvedValue(0);
    mockSlateUpdate.mockResolvedValue({ id: "slate-1", position: 1 });
    mockSlateFindFirst.mockResolvedValue(null);

    const res2 = await POST(makeRequest(CRON_SECRET));
    const body2 = await res2.json();

    expect(body2.updated).toBe(0);
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Slate promotion
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — slate promotion", () => {
  it("promotes the next slate when all games in the current slate are complete", async () => {
    const nextSlate = { id: "slate-2", leagueId: "league-1", position: 2, status: "upcoming" };

    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([dbGame]);
    mockGameUpdate.mockResolvedValue({ ...dbGame, status: "completed" });
    mockGameCount.mockResolvedValue(0); // no more incomplete games in slate
    mockSlateUpdate.mockResolvedValue({ id: "slate-1", position: 1 });
    mockSlateFindFirst.mockResolvedValue(nextSlate);

    await POST(makeRequest(CRON_SECRET));

    // slate-1 marked completed, slate-2 promoted
    expect(mockSlateUpdate).toHaveBeenCalledWith({
      where: { id: "slate-1" },
      data: { status: "completed" },
    });
    expect(mockSlateUpdate).toHaveBeenCalledWith({
      where: { id: "slate-2" },
      data: { status: "active" },
    });
  });

  it("does not promote if there are still incomplete games in the slate", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([completedESPNGame]);
    mockGameFindMany.mockResolvedValue([dbGame]);
    mockGameUpdate.mockResolvedValue({ ...dbGame, status: "completed" });
    mockGameCount.mockResolvedValue(2); // still 2 incomplete games

    await POST(makeRequest(CRON_SECRET));

    expect(mockSlateUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multi-sport
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — multi-sport", () => {
  it("polls ESPN once per distinct sport", async () => {
    const nbaSlate = { id: "slate-2", leagueId: "league-2", status: "active", league: { sport: "NBA" } };

    mockSlateFindMany.mockResolvedValue([activeNFLSlate, nbaSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([]);
    mockGameFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(mockFetchESPNScoreboard).toHaveBeenCalledTimes(2);
    expect(mockFetchESPNScoreboard).toHaveBeenCalledWith("NFL");
    expect(mockFetchESPNScoreboard).toHaveBeenCalledWith("NBA");
    expect(body.synced).toBe(2);
  });

  it("deduplicates sports when multiple leagues share the same sport", async () => {
    const anotherNFLSlate = {
      id: "slate-3",
      leagueId: "league-3",
      status: "active",
      league: { sport: "NFL" },
    };

    mockSlateFindMany.mockResolvedValue([activeNFLSlate, anotherNFLSlate]);
    mockFetchESPNScoreboard.mockResolvedValue([]);

    await POST(makeRequest(CRON_SECRET));

    expect(mockFetchESPNScoreboard).toHaveBeenCalledTimes(1);
    expect(mockFetchESPNScoreboard).toHaveBeenCalledWith("NFL");
  });
});

// ---------------------------------------------------------------------------
// ESPN error resilience
// ---------------------------------------------------------------------------

describe("POST /api/cron/sync-scores — ESPN errors", () => {
  it("returns 200 and skips sport when ESPN throws for that sport", async () => {
    mockSlateFindMany.mockResolvedValue([activeNFLSlate]);
    mockFetchESPNScoreboard.mockRejectedValue(new Error("ESPN API request failed: 503"));

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(0);
    expect(body.sports["NFL"]).toBe(0);
  });

  it("continues with other sports when one sport fails", async () => {
    const nbaSlate = { id: "slate-2", leagueId: "league-2", status: "active", league: { sport: "NBA" } };
    const nbaGame = { ...dbGame, id: "game-2", espnGameId: "espn-nba-1" };
    const completedNBAGame = { ...completedESPNGame, id: "espn-nba-1" };

    mockSlateFindMany.mockResolvedValue([activeNFLSlate, nbaSlate]);
    mockFetchESPNScoreboard
      .mockRejectedValueOnce(new Error("ESPN 503"))  // NFL fails
      .mockResolvedValueOnce([completedNBAGame]);      // NBA succeeds
    mockGameFindMany.mockResolvedValue([nbaGame]);
    mockGameUpdate.mockResolvedValue({ ...nbaGame, status: "completed" });

    const res = await POST(makeRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sports["NFL"]).toBe(0);
    expect(body.sports["NBA"]).toBe(1);
    expect(body.updated).toBe(1);
  });
});
