import { describe, it, expect, vi, afterEach } from "vitest";
import { parseESPNEvents, fetchESPNSchedule, fetchESPNScoreboard } from "@/lib/espn";

import scheduleFixture from "@/__tests__/fixtures/espn-nfl-schedule.json";
import scoreboardFixture from "@/__tests__/fixtures/espn-nfl-scoreboard.json";

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

  it("returns null scores for in-progress games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[1].homeScore).toBeNull();
    expect(games[1].awayScore).toBeNull();
  });

  it("returns null scores for scheduled games", () => {
    const games = parseESPNEvents(scoreboardFixture);
    expect(games[2].homeScore).toBeNull();
    expect(games[2].awayScore).toBeNull();
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
// fetchESPNSchedule — HTTP error handling
// ---------------------------------------------------------------------------

describe("fetchESPNSchedule", () => {
  it("throws when ESPN returns a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" }),
    );

    await expect(fetchESPNSchedule("NFL", "20260914")).rejects.toThrow(
      "ESPN API request failed: 503 Service Unavailable",
    );
  });

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
});

// ---------------------------------------------------------------------------
// fetchESPNScoreboard — HTTP error handling
// ---------------------------------------------------------------------------

describe("fetchESPNScoreboard", () => {
  it("throws when ESPN returns a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" }),
    );

    await expect(fetchESPNScoreboard("NFL")).rejects.toThrow(
      "ESPN API request failed: 429 Too Many Requests",
    );
  });

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
});
