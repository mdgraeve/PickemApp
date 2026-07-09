# Phase 6 — Auto-Slate & Smart Scheduling

## Overview

Phase 6 extends the slate creation workflow with sport-aware automation. Instead of manually selecting individual games from the master schedule, league admins can pull a full week's worth of games directly from ESPN, preview and deselect individual matchups, and create a slate in one click. Slate names are auto-generated from the league name and ESPN week number.

Phase 6 is being rolled out sport by sport. Football (NFL and NCAAF) is the highest-priority target because both are strictly week-structured — every game in a week belongs to the same round.

---

## Phase 6A — NFL Auto-Slates ✅

**Status:** Complete

### What was built

| Piece | Description |
|---|---|
| `GET /api/leagues/[leagueId]/slates/auto-preview` | Returns current ESPN week/season for the week picker seed value |
| `POST /api/leagues/[leagueId]/slates/auto-preview` | Fetches ESPN week schedule, upserts SportGame rows, returns proposed slate name + game list |
| `POST /api/leagues/[leagueId]/slates/auto-create` | Atomically creates Slate + Games from a confirmed list of SportGame IDs |
| `lib/football.ts` | `inferFootballSeason()`, `weekSlateName()`, `NCAAF_CONFERENCES`, `FBS_GROUP_ID` |
| Admin panel UI | Week navigator (← N →), season input, Preview button, game checklist, editable slate name, Create button |

### Auto-slate flow

1. Admin opens the "Auto-create Slate" panel (NFL/NCAAF leagues only).
2. App fetches current ESPN week and seeds the navigator.
3. Admin adjusts week/season and clicks **Preview Games**.
4. App calls ESPN, upserts results into `SportGame`, and returns the game list.
5. Admin deselects any games they don't want, edits the auto-generated name if needed.
6. Admin clicks **Create Slate with N games**.
7. API creates the slate and all game rows in one transaction.

### Season inference

`inferFootballSeason()` in `lib/football.ts`:
- Month 8–12 (Aug–Dec): current calendar year
- Month 1–7 (Jan–Jul): prior calendar year

This correctly handles bowl season (January/February of the year after the regular season started).

### Slate naming

`"[League Name] – Week [N]"` using U+2013 EN DASH. Example: `"Office NFL Pool – Week 4"`.

---

## Phase 6B — NCAAF Auto-Slates ✅

**Status:** Complete

### What was built (on top of 6A)

| Piece | Description |
|---|---|
| Conference checkboxes in admin UI | Grid of all FBS conferences (ACC, Big 12, Big Ten, SEC, AAC, CUSA, MAC, MWC, Sun Belt, FBS Independents) |
| `conferences[]` param in POST /auto-preview | Passed through to `fetchESPNWeeklyGames`; ignored for NFL |
| `fetchESPNWeeklyGames(sport, week, season, conferenceIds?)` | NFL: single ESPN request. NCAAF no filter: `groups=80` (all FBS). NCAAF with filter: parallel per-conference fetches via `Promise.allSettled`, merged + deduplicated by ESPN game ID |
| Conference resilience | Individual conference ESPN failures are silently skipped; remaining conferences still returned |

### Conference group IDs (ESPN)

| Conference | ESPN Group ID |
|---|---|
| ACC | 1 |
| Big 12 | 4 |
| Big Ten | 5 |
| SEC | 8 |
| American Athletic | 151 |
| Conference USA | 12 |
| Mid-American | 15 |
| Mountain West | 17 |
| Sun Belt | 37 |
| FBS Independents | 18 |

When no conferences are selected, `groups=80` fetches all FBS games in one request (most efficient path).

---

## Phase 6C — Other Sports (Planned)

Other sports (NBA, MLB, NHL, NCAAB) have very different scheduling patterns — multiple games per day, 80+ game seasons, no natural "week" concept. Automation here is lower priority and needs a different UX model.

### Candidate approaches

| Sport | Suggested model |
|---|---|
| NBA / NHL | **Date-based slate**: admin picks a date range (e.g., one week), preview shows all games in that window. |
| MLB | Same date-range model, but with team filtering (admins pick which franchises to include). |
| NCAAB | Conference-based filtering similar to NCAAF; tournament weeks (March Madness) are a natural slate unit. |

### Open questions

- Should slates be named by date range (`"NBA Pool – Jan 13–19"`) or by round number?
- Should there be a "daily slate" mode for high-volume sports?
- How should slate promotion (active → completed) work when games span multiple days?

These questions need product decisions before implementation begins.

---

## Technical notes

### SportGame upsert pattern

Both `/sync-espn` and `/auto-preview` use the same upsert pattern:
1. Fetch ESPN game IDs for the target window.
2. Query `SportGame` for existing rows by `espnId`.
3. For new ESPN IDs: `createMany`.
4. For existing ESPN IDs: `update` each row (scores, status, scheduled time may have changed).

This is idempotent — calling the same endpoint twice is safe.

### Transaction design

`/auto-create` uses a single Prisma `$transaction` to ensure that either the entire slate (slate row + all game rows) is committed or nothing is. This prevents partially-created slates if game inserts fail midway.

### ESPN client functions (lib/espn.ts)

| Function | Purpose |
|---|---|
| `fetchESPNCurrentWeek(sport)` | Returns `{ weekNumber, season, seasonType }` for the current week |
| `fetchESPNWeeklyGames(sport, week, season, conferenceIds?)` | Returns `ESPNGame[]` for a specific week; handles NFL vs NCAAF routing and conference filtering |
| `fetchESPNScoreboard(sport, date?)` | Existing function: returns games for a date (used by cron and sync-espn) |
| `fetchESPNSchedule(sport, date)` | Existing function: returns schedule for a date |
