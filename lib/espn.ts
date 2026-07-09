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

/** Season and week metadata returned by the ESPN scoreboard for football sports. */
export type ESPNWeekInfo = {
  weekNumber: number;
  /** Four-digit season start year, e.g. 2026. */
  season: number;
  /** 1 = preseason, 2 = regular, 3 = postseason. */
  seasonType: number;
};

export type ESPNGame = {
  /** ESPN's own stable identifier for the event. */
  id: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: Date;
  status: ESPNGameStatus;
  /** Null unless status is "completed" or "in_progress". */
  homeScore: number | null;
  /** Null unless status is "completed" or "in_progress". */
  awayScore: number | null;
  /** Time remaining in current period. Null unless status is "in_progress". */
  clock: string | null;
  /** Current period or inning number. Null unless status is "in_progress". */
  period: number | null;
  /** Human-readable game state, e.g. "Bot 7th" or "2nd - 14:32". Null unless status is "in_progress". */
  shortDetail: string | null;
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
  homeAway: string; // "home" | "away" at runtime; string here so JSON fixture imports satisfy the type
  team: { displayName: string };
  score?: string;
};

type RawStatusType = {
  name: string;
  completed: boolean;
  shortDetail?: string;
};

type RawEvent = {
  id: string;
  date: string;
  status: {
    displayClock?: string;
    period?: number;
    type: RawStatusType;
  };
  competitions: Array<{ competitors: RawCompetitor[] }>;
};

type RawScoreboardResponse = {
  events?: RawEvent[];
  /** Present on NFL and NCAAF scoreboards. */
  season?: { year: number; type: number };
  /** Present on NFL and NCAAF scoreboards. */
  week?: { number: number };
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

    // Extract scores for completed and in-progress games; treat parse failures as null.
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    if (status === "completed" || status === "in_progress") {
      const h = parseInt(home.score ?? "", 10);
      const a = parseInt(away.score ?? "", 10);
      homeScore = Number.isNaN(h) ? null : h;
      awayScore = Number.isNaN(a) ? null : a;
    }

    const clock = status === "in_progress" ? (event.status.displayClock ?? null) : null;
    const period = status === "in_progress" ? (event.status.period ?? null) : null;
    const shortDetail = status === "in_progress" ? (event.status.type.shortDetail ?? null) : null;

    games.push({
      id: event.id,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      scheduledAt: new Date(event.date),
      status,
      homeScore,
      awayScore,
      clock,
      period,
      shortDetail,
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

/** Max number of attempts (1 initial + 2 retries). */
const MAX_ATTEMPTS = 3;

/** Delay in ms before each retry: [attempt-1] → delay. */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** True for status codes worth retrying (server errors + rate-limiting). */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with retry logic, returning the raw Response.
 * Retries on HTTP 5xx and 429 (rate-limit) and on network-level errors.
 * Does NOT retry on other 4xx status codes.
 */
async function httpFetch(url: string): Promise<Response> {
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (networkErr) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        attempt++;
        continue;
      }
      throw new Error(
        `ESPN API network error after ${MAX_ATTEMPTS} attempts — ${url}: ${String(networkErr)}`,
      );
    }

    if (!res.ok) {
      const err = new Error(
        `ESPN API request failed: ${res.status} ${res.statusText} — ${url}`,
      );
      if (isRetryable(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        attempt++;
        continue;
      }
      throw err;
    }

    return res;
  }
}

async function fetchAndParse(url: string): Promise<ESPNGame[]> {
  const res = await httpFetch(url);
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

/**
 * Returns the current week number and season year from ESPN for a football sport.
 * Only meaningful for NFL and NCAAF; other sports don't carry week metadata.
 * Falls back to week 1 / inferred season if the ESPN response omits the fields.
 */
export async function fetchESPNCurrentWeek(
  sport: "NFL" | "NCAAF",
): Promise<ESPNWeekInfo> {
  const url = scoreboardUrl(sport as Sport);
  const res = await httpFetch(url);
  const data = (await res.json()) as RawScoreboardResponse;
  const { inferFootballSeason } = await import("@/lib/football");
  return {
    weekNumber: data.week?.number ?? 1,
    season: data.season?.year ?? inferFootballSeason(),
    seasonType: data.season?.type ?? 2,
  };
}

/**
 * Fetches all games for a specific NFL or NCAAF week from ESPN.
 *
 * For NCAAF, pass an array of ESPN conference group IDs to filter results.
 * When multiple conference IDs are given, one ESPN request is made per conference
 * and the results are merged and de-duplicated by ESPN game ID.
 * If no conference IDs are provided for NCAAF, all FBS games are returned
 * (groups=80).
 *
 * @param sport         "NFL" or "NCAAF"
 * @param week          Regular-season week number (1-based)
 * @param season        Four-digit season start year (e.g. 2026)
 * @param conferenceIds ESPN group IDs to filter NCAAF by conference
 */
export async function fetchESPNWeeklyGames(
  sport: "NFL" | "NCAAF",
  week: number,
  season: number,
  conferenceIds?: number[],
): Promise<ESPNGame[]> {
  const baseParams: Record<string, string> = {
    seasontype: "2",
    week: String(week),
    dates: String(season),
    limit: "100",
  };

  if (sport === "NFL") {
    return fetchAndParse(scoreboardUrl(sport as Sport, baseParams));
  }

  // NCAAF — filter by conference or fall back to all FBS
  if (!conferenceIds || conferenceIds.length === 0) {
    return fetchAndParse(
      scoreboardUrl(sport as Sport, { ...baseParams, groups: "80" }),
    );
  }

  // One request per selected conference; merge and deduplicate by ESPN game ID.
  const results = await Promise.allSettled(
    conferenceIds.map((id) =>
      fetchAndParse(
        scoreboardUrl(sport as Sport, { ...baseParams, groups: String(id) }),
      ),
    ),
  );

  const seen = new Set<string>();
  const merged: ESPNGame[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const game of result.value) {
        if (!seen.has(game.id)) {
          seen.add(game.id);
          merged.push(game);
        }
      }
    }
  }
  return merged;
}
