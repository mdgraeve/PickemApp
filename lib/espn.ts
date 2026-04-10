// ESPN public scoreboard API client.
//
// This is the single boundary between the app and ESPN's API — nothing
// ESPN-related is fetched anywhere else. Route handlers receive clean
// ESPNGame[] objects; they never touch raw ESPN JSON.
//
// To swap to a paid provider, replace the two fetch functions and the
// raw types below. The exported types and parseESPNEvents signature
// remain stable so callers and tests don't change.

import type { Sport } from "@/lib/sports";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ESPNGameStatus = "scheduled" | "in_progress" | "completed";

export type ESPNGame = {
  /** ESPN's own stable identifier for the event. */
  id: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: Date;
  status: ESPNGameStatus;
  /** Null unless status is "completed". */
  homeScore: number | null;
  /** Null unless status is "completed". */
  awayScore: number | null;
};

// ---------------------------------------------------------------------------
// Sport → ESPN scoreboard path
// ---------------------------------------------------------------------------

const ESPN_PATHS: Record<Sport, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// ---------------------------------------------------------------------------
// Raw ESPN response types (internal — never exported)
// ---------------------------------------------------------------------------

type RawCompetitor = {
  homeAway: "home" | "away";
  team: { displayName: string };
  score?: string;
};

type RawStatusType = {
  name: string;
  completed: boolean;
};

type RawEvent = {
  id: string;
  date: string;
  status: { type: RawStatusType };
  competitions: Array<{ competitors: RawCompetitor[] }>;
};

type RawScoreboardResponse = {
  events?: RawEvent[];
};

// ---------------------------------------------------------------------------
// Parsing (exported for unit testing without HTTP)
// ---------------------------------------------------------------------------

function parseStatus(typeName: string, completed: boolean): ESPNGameStatus {
  if (completed) return "completed";
  // Live states ESPN may report
  if (
    typeName === "STATUS_IN_PROGRESS" ||
    typeName === "STATUS_HALFTIME" ||
    typeName === "STATUS_END_PERIOD"
  ) {
    return "in_progress";
  }
  return "scheduled";
}

/**
 * Converts a raw ESPN scoreboard/schedule response into ESPNGame[].
 * Exported so tests can exercise the parsing logic without HTTP calls.
 * Events missing a competition or home/away competitor are skipped silently.
 */
export function parseESPNEvents(raw: RawScoreboardResponse): ESPNGame[] {
  const games: ESPNGame[] = [];

  for (const event of raw.events ?? []) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const home = competition.competitors?.find((c) => c.homeAway === "home");
    const away = competition.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const status = parseStatus(
      event.status.type.name,
      event.status.type.completed,
    );

    // Only extract scores for completed games; treat parse failures as null.
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    if (status === "completed") {
      const h = parseInt(home.score ?? "", 10);
      const a = parseInt(away.score ?? "", 10);
      homeScore = Number.isNaN(h) ? null : h;
      awayScore = Number.isNaN(a) ? null : a;
    }

    games.push({
      id: event.id,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      scheduledAt: new Date(event.date),
      status,
      homeScore,
      awayScore,
    });
  }

  return games;
}

// ---------------------------------------------------------------------------
// HTTP fetch helpers (private)
// ---------------------------------------------------------------------------

function scoreboardUrl(sport: Sport, params?: Record<string, string>): string {
  const base = `${ESPN_BASE}/${ESPN_PATHS[sport]}/scoreboard`;
  if (!params) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

async function fetchAndParse(url: string): Promise<ESPNGame[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `ESPN API request failed: ${res.status} ${res.statusText} — ${url}`,
    );
  }
  const data = (await res.json()) as RawScoreboardResponse;
  return parseESPNEvents(data);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches games for a sport on a specific calendar date from ESPN.
 * date must be in YYYYMMDD format (e.g. "20260914").
 * Intended for the schedule-import admin route and the per-slate sync endpoint.
 */
export async function fetchESPNSchedule(
  sport: Sport,
  date: string,
): Promise<ESPNGame[]> {
  const url = scoreboardUrl(sport, { limit: "100", dates: date });
  return fetchAndParse(url);
}

/**
 * Fetches the current-week scoreboard for a sport from ESPN.
 * Intended for the score-sync cron (Task 3).
 */
export async function fetchESPNScoreboard(sport: Sport): Promise<ESPNGame[]> {
  const url = scoreboardUrl(sport, { limit: "100" });
  return fetchAndParse(url);
}
