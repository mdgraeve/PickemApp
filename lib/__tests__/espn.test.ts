import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  parseESPNEvents,
  fetchESPNSchedule,
  fetchESPNScoreboard,
  fetchESPNCurrentWeek,
  fetchESPNWeeklyGames,
} from "@/lib/espn";

import scheduleFixture from "@/__tests__/fixtures/espn-nfl-schedule.json";
import scoreboardFixture from "@/__tests__/fixtures/espn-nfl-scoreboard.json";
import mlbScoreboardFixture from "@/__tests__/fixtures/espn-mlb-scoreboard.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// parseESPNEvents — schedule fixture (all scheduled, no scores)
// ---------------------------------------------------------------------------

describe("parseESPNEvents — schedule fixture", () => {
  it("returns one ESPNGame per event", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games).toHaveLength(2);
  });

  it("maps ESPN IDs correctly", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games[0].id).toBe("401547417");
    expect(games[1].id).toBe("401547418");
  });

  it("sets homeTeam and awayTeam from competitors", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games[0].homeTeam).toBe("Kansas City Chiefs");
    expect(games[0].awayTeam).toBe("Baltimore Ravens");
    expect(games[1].homeTeam).toBe("Dallas Cowboys");
    expect(games[1].awayTeam).toBe("New York Giants");
  });

  it("parses scheduledAt as a Date", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games[0].scheduledAt).toBeInstanceOf(Date);
    expect(games[0].scheduledAt.toISOString()).toBe("2026-09-07T00:20:00.000Z");
  });

  it("marks all games as scheduled", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games[0].status).toBe("scheduled");
    expect(games[1].status).toBe("scheduled");
  });

  it("returns null scores for scheduled games", () => {
    const games = parseESPNEvents(scheduleFixture);
    expect(games[0].homeScore).toBeNull();
    expect(games[0].awayScore).toBeNull();
    expect(games[1].homeScore).toBeNull();
    expect(games[1].awayScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseESPNEvents — scoreboard fixture (completed, in_progress, scheduled)
// ---------------------------------------------------------------------------

describe("parseESPNEvents — scoreboard fixture", () => {
  it("returns one ESPNGame per event", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games).toHaveLength(3);
  });

  it("maps STATUS_FINAL → completed", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[0].status).toBe("completed");
  });

  it("maps STATUS_IN_PROGRESS → in_progress", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[1].status).toBe("in_progress");
  });

  it("maps STATUS_SCHEDULED → scheduled", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[2].status).toBe("scheduled");
  });

  it("extracts integer scores for completed games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[0].homeScore).toBe(27);
    expect(games[0].awayScore).toBe(20);
  });

  it("extracts live scores for in-progress games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[1].homeScore).toBe(14);
    expect(games[1].awayScore).toBe(7);
  });

  it("returns null scores for scheduled games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[2].homeScore).toBeNull();
    expect(games[2].awayScore).toBeNull();
  });

  it("returns null clock/period/shortDetail when fields are absent from ESPN response", () => {
    const games = parseESPNEvents(scoreboardFixture);
    // NFL fixture in-progress event has no displayClock, period, or shortDetail fields
    expect(games[1].clock).toBeNull();
    expect(games[1].period).toBeNull();
    expect(games[1].shortDetail).toBeNull();
  });

  it("returns null clock/period/shortDetail for completed and scheduled games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[0].clock).toBeNull();
    expect(games[0].period).toBeNull();
    expect(games[0].shortDetail).toBeNull();
    expect(games[2].clock).toBeNull();
    expect(games[2].period).toBeNull();
    expect(games[2].shortDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseESPNEvents — live / halftime status names
// ---------------------------------------------------------------------------

describe("parseESPNEvents — live status variants", () => {
  it("maps STATUS_HALFTIME → in_progress", () => {
    const raw = {
      events: [
        {
          id: "1",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_HALFTIME", completed: false } },
          competitions: [
            {
              competitors: [
                { homeAway: "home" as const, team: { displayName: "Team A" }, score: "10" },
                { homeAway: "away" as const, team: { displayName: "Team B" }, score: "7" },
              ],
            },
          ],
        },
      ],
    };
    const games = parseESPNEvents(raw);
    expect(games[0].status).toBe("in_progress");
  });

  it("maps STATUS_END_PERIOD → in_progress", () => {
    const raw = {
      events: [
        {
          id: "2",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_END_PERIOD", completed: false } },
          competitions: [
            {
              competitors: [
                { homeAway: "home" as const, team: { displayName: "Team A" }, score: "3" },
                { homeAway: "away" as const, team: { displayName: "Team B" }, score: "0" },
              ],
            },
          ],
        },
      ],
    };
    const games = parseESPNEvents(raw);
    expect(games[0].status).toBe("in_progress");
  });

  it("treats completed:true as completed regardless of status name", () => {
    const raw = {
      events: [
        {
          id: "3",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_FINAL_OT", completed: true } },
          competitions: [
            {
              competitors: [
                { homeAway: "home" as const, team: { displayName: "Team A" }, score: "31" },
                { homeAway: "away" as const, team: { displayName: "Team B" }, score: "28" },
              ],
            },
          ],
        },
      ],
    };
    const games = parseESPNEvents(raw);
    expect(games[0].status).toBe("completed");
    expect(games[0].homeScore).toBe(31);
    expect(games[0].awayScore).toBe(28);
    expect(games[0].clock).toBeNull();
    expect(games[0].period).toBeNull();
    expect(games[0].shortDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseESPNEvents — MLB scoreboard fixture (live fields: clock, period, shortDetail)
// ---------------------------------------------------------------------------

describe("parseESPNEvents — MLB scoreboard fixture", () => {
  it("populates clock, period, shortDetail for in_progress games", () => {
    const games = parseESPNEvents(mlbScoreboardFixture);
    expect(games[0].status).toBe("in_progress");
    expect(games[0].clock).toBe("0:00");
    expect(games[0].period).toBe(7);
    expect(games[0].shortDetail).toBe("Bot 7th");
  });

  it("extracts scores for in_progress games", () => {
    const games = parseESPNEvents(mlbScoreboardFixture);
    expect(games[0].homeScore).toBe(3);
    expect(games[0].awayScore).toBe(1);
  });

  it("sets clock/period/shortDetail to null for completed games", () => {
    const games = parseESPNEvents(mlbScoreboardFixture);
    expect(games[1].status).toBe("completed");
    expect(games[1].clock).toBeNull();
    expect(games[1].period).toBeNull();
    expect(games[1].shortDetail).toBeNull();
  });

  it("sets clock/period/shortDetail to null for scheduled games", () => {
    const games = parseESPNEvents(mlbScoreboardFixture);
    expect(games[2].status).toBe("scheduled");
    expect(games[2].clock).toBeNull();
    expect(games[2].period).toBeNull();
    expect(games[2].shortDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseESPNEvents — edge cases
// ---------------------------------------------------------------------------

describe("parseESPNEvents — edge cases", () => {
  it("returns empty array for empty events list", () => {
    expect(parseESPNEvents({ events: [] })).toEqual([]);
  });

  it("returns empty array when events key is missing", () => {
    expect(parseESPNEvents({})).toEqual([]);
  });

  it("skips events with no competitions array", () => {
    const raw = {
      events: [
        {
          id: "99",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_SCHEDULED", completed: false } },
          competitions: [] as Array<{ competitors: never[] }>,
        },
      ],
    };
    expect(parseESPNEvents(raw)).toHaveLength(0);
  });

  it("skips events where home competitor is missing", () => {
    const raw = {
      events: [
        {
          id: "99",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_SCHEDULED", completed: false } },
          competitions: [
            {
              competitors: [
                { homeAway: "away" as const, team: { displayName: "Team B" }, score: "0" },
              ],
            },
          ],
        },
      ],
    };
    expect(parseESPNEvents(raw)).toHaveLength(0);
  });

  it("skips events where away competitor is missing", () => {
    const raw = {
      events: [
        {
          id: "99",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_SCHEDULED", completed: false } },
          competitions: [
            {
              competitors: [
                { homeAway: "home" as const, team: { displayName: "Team A" }, score: "0" },
              ],
            },
          ],
        },
      ],
    };
    expect(parseESPNEvents(raw)).toHaveLength(0);
  });

  it("treats unparseable score strings as null even on completed games", () => {
    const raw = {
      events: [
        {
          id: "99",
          date: "2026-09-07T20:00:00Z",
          status: { type: { name: "STATUS_FINAL", completed: true } },
          competitions: [
            {
              competitors: [
                { homeAway: "home" as const, team: { displayName: "Team A" }, score: "N/A" },
                { homeAway: "away" as const, team: { displayName: "Team B" }, score: "N/A" },
              ],
            },
          ],
        },
      ],
    };
    const games = parseESPNEvents(raw);
    expect(games[0].homeScore).toBeNull();
    expect(games[0].awayScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchESPNSchedule — URL construction and successful response
// ---------------------------------------------------------------------------

describe("fetchESPNSchedule", () => {
  it("calls the correct ESPN URL for a given sport and date", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNSchedule("NFL", "20260914");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("football/nfl/scoreboard");
    expect(calledUrl).toContain("dates=20260914");
    expect(calledUrl).toContain("limit=100");
  });

  it("calls the correct ESPN URL for NBA", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNSchedule("NBA", "20260914");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("basketball/nba/scoreboard");
  });

  it("throws immediately on a non-retryable 4xx error (no retry)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchESPNSchedule("NFL", "20260914")).rejects.toThrow(
      "ESPN API request failed: 404 Not Found",
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// fetchESPNScoreboard — URL construction and successful response
// ---------------------------------------------------------------------------

describe("fetchESPNScoreboard", () => {
  it("calls the correct ESPN URL for a given sport", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNScoreboard("NHL");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("hockey/nhl/scoreboard");
  });

  it("returns parsed ESPNGame[] from a valid response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(scoreboardFixture),
    }));

    const games = await fetchESPNScoreboard("NFL");
    expect(games).toHaveLength(3);
    expect(games[0].status).toBe("completed");
    expect(games[0].homeScore).toBe(27);
  });

  it("throws immediately on a non-retryable 4xx error (no retry)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchESPNScoreboard("NFL")).rejects.toThrow(
      "ESPN API request failed: 400 Bad Request",
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Retry behaviour — uses fake timers to avoid real delays in tests
// ---------------------------------------------------------------------------

describe("retry behaviour", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries 3 times total on persistent 503 then throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNScoreboard("NFL");
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(promise).rejects.toThrow("ESPN API request failed: 503 Service Unavailable");
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries 3 times total on persistent 429 then throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNScoreboard("NFL");
    const assertion = expect(promise).rejects.toThrow("ESPN API request failed: 429 Too Many Requests");
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("succeeds on the 2nd attempt after a transient 503", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [] }) });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNSchedule("NFL", "20260914");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("succeeds on the 3rd attempt after two transient 503s", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [] }) });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNSchedule("NFL", "20260914");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on network error then succeeds", async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [] }) });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNScoreboard("NBA");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws a network error message after all attempts exhausted", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchESPNScoreboard("NBA");
    const assertion = expect(promise).rejects.toThrow("ESPN API network error after 3 attempts");
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// fetchESPNCurrentWeek
// ---------------------------------------------------------------------------

describe("fetchESPNCurrentWeek", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns weekNumber, season, and seasonType from the ESPN response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            season: { year: 2026, type: 2 },
            week: { number: 4 },
            events: [],
          }),
      }),
    );

    const info = await fetchESPNCurrentWeek("NFL");
    expect(info.weekNumber).toBe(4);
    expect(info.season).toBe(2026);
    expect(info.seasonType).toBe(2);
  });

  it("falls back to weekNumber 1 when week field is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ season: { year: 2026, type: 2 }, events: [] }),
      }),
    );

    const info = await fetchESPNCurrentWeek("NFL");
    expect(info.weekNumber).toBe(1);
  });

  it("constructs a URL without week or date params (fetches current week)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ season: { year: 2026, type: 2 }, week: { number: 1 }, events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNCurrentWeek("NCAAF");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("college-football/scoreboard");
    expect(url).not.toContain("week=");
    expect(url).not.toContain("dates=");
  });

  it("throws on ESPN error (propagated from httpFetch)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }),
    );

    await expect(fetchESPNCurrentWeek("NFL")).rejects.toThrow(
      "ESPN API request failed: 404 Not Found",
    );
  });
});

// ---------------------------------------------------------------------------
// fetchESPNWeeklyGames
// ---------------------------------------------------------------------------

describe("fetchESPNWeeklyGames", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("constructs correct URL for NFL (no groups param)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNWeeklyGames("NFL", 4, 2026);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("football/nfl/scoreboard");
    expect(url).toContain("seasontype=2");
    expect(url).toContain("week=4");
    expect(url).toContain("dates=2026");
    expect(url).not.toContain("groups=");
  });

  it("constructs correct URL for NCAAF with no conferences (groups=80)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchESPNWeeklyGames("NCAAF", 1, 2026);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("college-football/scoreboard");
    expect(url).toContain("groups=80");
  });

  it("makes one request per conference and merges results for NCAAF", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          events: [{
            id: "game-1",
            date: "2026-09-07T20:00:00Z",
            status: { type: { name: "STATUS_SCHEDULED", completed: false } },
            competitions: [{ competitors: [
              { homeAway: "home", team: { displayName: "Alabama" } },
              { homeAway: "away", team: { displayName: "Georgia" } },
            ]}],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          events: [{
            id: "game-2",
            date: "2026-09-07T20:00:00Z",
            status: { type: { name: "STATUS_SCHEDULED", completed: false } },
            competitions: [{ competitors: [
              { homeAway: "home", team: { displayName: "Ohio State" } },
              { homeAway: "away", team: { displayName: "Michigan" } },
            ]}],
          }],
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const games = await fetchESPNWeeklyGames("NCAAF", 1, 2026, [8, 5]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(games).toHaveLength(2);
    expect(games.map((g) => g.id)).toEqual(["game-1", "game-2"]);
  });

  it("deduplicates games that appear in multiple conference responses", async () => {
    const sharedEvent = {
      id: "game-shared",
      date: "2026-09-07T20:00:00Z",
      status: { type: { name: "STATUS_SCHEDULED", completed: false } },
      competitions: [{ competitors: [
        { homeAway: "home", team: { displayName: "Team A" } },
        { homeAway: "away", team: { displayName: "Team B" } },
      ]}],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [sharedEvent] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const games = await fetchESPNWeeklyGames("NCAAF", 1, 2026, [8, 5]);

    expect(games).toHaveLength(1);
    expect(games[0].id).toBe("game-shared");
  });

  it("skips a conference that returns an ESPN error and returns the rest", async () => {
    vi.useFakeTimers();
    try {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            events: [{
              id: "game-ok",
              date: "2026-09-07T20:00:00Z",
              status: { type: { name: "STATUS_SCHEDULED", completed: false } },
              competitions: [{ competitors: [
                { homeAway: "home", team: { displayName: "Ohio State" } },
                { homeAway: "away", team: { displayName: "Michigan" } },
              ]}],
            }],
          }),
        });
      vi.stubGlobal("fetch", mockFetch);

      // Conference 8 (SEC) will fail all retries; conference 5 (Big Ten) succeeds
      const promise = fetchESPNWeeklyGames("NCAAF", 1, 2026, [8, 5]);
      await vi.runAllTimersAsync();
      const games = await promise;

      expect(games).toHaveLength(1);
      expect(games[0].id).toBe("game-ok");
    } finally {
      vi.useRealTimers();
    }
  });
});
