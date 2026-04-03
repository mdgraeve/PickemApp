# Phase 2 -- Slates & Sports

**Status: In progress**

Phase 2 introduces the concept of sports and slates. By the end of this phase, leagues will be tied to a single sport, games will be drawn from a sport-level master schedule, and those games will be grouped into sequentially-released slates so that only one round of games is active at a time.

---

## Goals

By the end of Phase 2, the app will be able to:

1. **Associate a league with a single sport** -- when creating a league, the creator chooses a sport (e.g. NFL, NBA). The sport determines which game schedule the league draws from. A user can belong to multiple leagues across different sports.

2. **Maintain a master game schedule per sport** -- the app holds a canonical list of games per sport (teams, date/time). Individual leagues do not define their own games from scratch; they draw from this shared schedule.

3. **Group games into slates** -- games within a league are organized into named slates (e.g. "Week 1", "Week 2"). A slate has a name, an ordered position, and a status.

4. **Release slates sequentially** -- only one slate is active per league at a time. A slate becomes active automatically once the previous slate is complete (all its games are scored). Future slates are not visible to users until they become active.

5. **Show per-slate leaderboard results** -- in addition to overall standings, users can view the leaderboard for a specific slate to see who won that round.

---

## Tasks

### 1. Sport field on League
**Status: Complete**

- Add `sport` field (String) to the `League` model via a Prisma migration ✓
- Update `POST /api/leagues` to require and validate `sport` ✓
- Update `GET /api/leagues` response to include `sport` ✓
- Update the create-league UI to include a sport selector ✓

Supported sports: NFL, NBA, MLB, NHL, NCAAF, NCAAB (defined in `lib/sports.ts`). The API returns 400 with a descriptive error if an invalid sport is submitted. The create-league UI is at `/leagues/new`.

### 2. Master game schedule (SportGame model)
**Status: Complete**

- Add a `SportGame` model to the schema ✓ (done in phase-2 schema migration)
- Add a seed script to populate a sample schedule for development/testing ✓
- No public API needed yet — leagues consume this data internally when slates are built

Seed script lives at `prisma/seed.ts` and is run with `npx prisma db seed`. The script is idempotent (clears all SportGame rows before inserting). Current seed data:
- NFL 2026: 10 games across Week 1 (Sept 6–8) and Week 2 (Sept 13–15)
- NBA 2026-2027: 5 games for Opening Week (Oct 19–21)

Seed configuration is in `prisma.config.ts` (`migrations.seed`). The script uses the same `@prisma/adapter-pg` setup as the main app client.

### 3. Slate model and Game association
**Status: Complete**

- Add `Slate` model and `slateId` on `Game` to the schema ✓ (done in phase-2 schema migration)
- `GET /api/leagues/[leagueId]/slates` — list slates for a league ordered by position, with game count ✓
- `POST /api/leagues/[leagueId]/slates` — admin creates a slate (name + position); 409 on duplicate position ✓
- `POST /api/leagues/[leagueId]/slates/[slateId]/games` — admin populates a slate with games drawn from the SportGame master schedule; enforces sport match between league and SportGame ✓

New slates are created with `status: "upcoming"`. Only admins can create slates or add games to them. The sport-mismatch guard prevents adding e.g. an NBA game to an NFL league.

### 4. Sequential slate release logic
**Status: Complete**

- `POST /api/leagues/[leagueId]/slates` auto-activates the new slate if no active slate exists for that league; otherwise creates it as `upcoming` ✓
- `PATCH /api/leagues/[leagueId]/games/[gameId]` — admin records a game result (`homeScore`, `awayScore`); sets game `status` to `completed`; triggers slate promotion check ✓
- Slate promotion: after each game result, if no incomplete games remain in the slate, the slate is marked `completed` and the next `upcoming` slate (by position) is activated automatically ✓
- Re-scoring an already-completed game updates the scores without re-triggering promotion ✓
- Games without a `slateId` (pre-Phase-2 data) are updated without triggering any slate logic ✓

### 5. Update games API for slates
**Status: Complete**

- `GET /api/leagues/[leagueId]/games` now returns games for the active slate only, with slate metadata (`{ slate, games }`); returns `{ slate: null, games: [] }` when no active slate exists ✓
- `GET /api/leagues/[leagueId]/slates/[slateId]/games` — any member can retrieve games for a specific slate by ID, with slate metadata; useful for viewing completed slate history ✓

### 6. Per-slate leaderboard
**Status: Not started**

- Update `GET /api/leagues/[leagueId]/leaderboard` to accept an optional `?slateId=` query parameter
- When `slateId` is provided, score only picks for games in that slate
- When omitted, score picks across all completed slates (existing overall behavior)
- Update the leaderboard UI to show a slate selector

---

## Schema changes required

The following schema migrations were needed before any of the above features can be built. All four have been applied in migration `20260403203730_phase_2_schema`.

| Change | Model | Details | Status |
|---|---|---|---|
| Add `sport` | `League` | Nullable String; required at API level for new leagues | Done |
| Add `SportGame` | new model | Canonical schedule per sport | Done |
| Add `Slate` | new model | `leagueId`, `name`, `position`, `status` | Done |
| Add `slateId` | `Game` | Nullable FK to `Slate`; to be required after backfill | Done |

These are additive changes — no existing MVP data structures were removed or renamed.

Note: `sport` on `League` and `slateId` on `Game` are nullable at the database level so that existing rows are not broken by the migration. Both are treated as required at the API level for any new data created going forward.

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| Single-sport leagues | Yes | `sport` field on `League`, validated in API, selector in create-league UI |
| Master game schedule | Yes | `SportGame` model + seed script with NFL and NBA sample data |
| Slates | Yes | Schema done; GET/POST slates API + POST slate games API implemented |
| Sequential slate release | Yes | First slate auto-activates; PATCH game result triggers promotion |
| Per-slate leaderboard | Partially | Leaderboard logic is in place; needs `slateId` filter added |
| Pick deadline enforcement | Yes | Already locks picks at `game.startTime` |
| Overall leaderboard | Yes | Fully implemented |
