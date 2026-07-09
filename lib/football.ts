// Football-specific constants and utilities used by NFL and NCAAF auto-slate generation.
//
// ESPN uses numeric "group" IDs to scope their college football scoreboard to a
// specific conference. These IDs come from ESPN's undocumented public API and
// are stable in practice, but may change if ESPN restructures their data.

export type NCAAFConference = {
  id: number;
  name: string;
  abbrev: string;
};

/**
 * ESPN group IDs for major FBS conferences.
 * Pass one or more of these as the `groups` query param on ESPN's
 * college-football scoreboard endpoint to filter by conference.
 */
export const NCAAF_CONFERENCES: NCAAFConference[] = [
  { id: 1,   name: "ACC",               abbrev: "ACC"   },
  { id: 4,   name: "Big 12",            abbrev: "BIG12" },
  { id: 5,   name: "Big Ten",           abbrev: "B10"   },
  { id: 8,   name: "SEC",               abbrev: "SEC"   },
  { id: 151, name: "American Athletic", abbrev: "AAC"   },
  { id: 12,  name: "Conference USA",    abbrev: "CUSA"  },
  { id: 15,  name: "Mid-American",      abbrev: "MAC"   },
  { id: 17,  name: "Mountain West",     abbrev: "MWC"   },
  { id: 37,  name: "Sun Belt",          abbrev: "SBC"   },
  { id: 18,  name: "FBS Independents",  abbrev: "IND"   },
];

/** ESPN `groups` value that returns all FBS games (no conference filter). */
export const FBS_GROUP_ID = 80;

/**
 * Infers the current football season year.
 * The NFL and NCAAF seasons both begin in late August / early September.
 * Convention: the season is named for the calendar year it starts.
 *
 * August–December → current year (season in progress or about to start)
 * January–July    → prior year  (still inside that season, or offseason)
 */
export function inferFootballSeason(): number {
  const month = new Date().getMonth() + 1; // 1-indexed
  return month >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

/**
 * Returns the canonical auto-slate name for a weekly football slate.
 * Format: "<League Name> – Week <N>"
 * e.g. "Office NFL Pool – Week 4"
 */
export function weekSlateName(leagueName: string, weekNumber: number): string {
  return `${leagueName} \u2013 Week ${weekNumber}`;
}
