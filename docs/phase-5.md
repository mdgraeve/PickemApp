# Phase 5 -- Sports Data Integration

**Status: Not started**

Phase 5 eliminates the two biggest sources of manual admin work: populating the game schedule and entering scores. It introduces a dependency on an external sports data API (ESPN's public scoreboard endpoint, with a path to a paid provider later) and a cron-based background sync process.

---

## Goals

1. **Automatic schedule import** — replace the manual `npx prisma db seed` step with an admin-triggered (or scheduled) import that pulls upcoming games from the ESPN API directly into the `SportGame` table.
2. **Automatic score sync** — a cron job polls ESPN for completed game results and writes scores back to `Game` rows, triggering the existing slate-promotion logic automatically.

---

## External API

ESPN operates an undocumented but widely-used public scoreboard API that requires no key:

```
https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
```

| Our sport | ESPN path |
|---|---|
| NFL | `football/nfl` |
| NBA | `basketball/nba` |
| MLB | `baseball/mlb` |
| NHL | `hockey/nhl` |
| NCAAF | `football/college-football` |
| NCAAB | `basketball/mens-college-basketball` |

**Risk:** this API is undocumented and can change without notice. It is suitable for prototyping and early production. If reliability becomes a concern, migrating to a paid provider (SportRadar, MySportsFeeds) would only affect `lib/espn.ts` (Task 0) — no other app code would change.

---

## Key architectural decisions

### ESPN game ID

The score-sync cron needs to match ESPN game results back to `Game` rows in our database. Matching by team name is fragile (ESPN uses full names like "Kansas City Chiefs"; our DB stores whatever the admin entered). The reliable solution is to store the ESPN game ID at import time:

- Add `espnId String? @unique` to `SportGame`
- When admins add games to a slate from the SportGame table, copy `espnId` to the `Game` row (add `espnGameId String?` to `Game`)
- The score-sync cron matches by `espnGameId`

Games added manually (without going through the SportGame table) will have no `espnGameId` and are simply skipped by the cron.

### App-level admin gating

The schedule-import endpoint is an ops/developer tool — functionally equivalent to `npx prisma db seed` but triggered via HTTP. The right gate is an environment variable, not a schema change.

**Decision: `APP_ADMIN_EMAILS` environment variable**

- Comma-separated list of email addresses permitted to call `/api/admin/sync-schedule`
- Checked server-side against `session.user.email`
- No `User` model change — avoids a migration and a chicken-and-egg deployment problem (how do you set `isAppAdmin = true` on first deploy without already being in the DB?)
- Set once at deployment time alongside `DATABASE_URL`, `NEXTAUTH_SECRET`, etc.

This is the correct choice because "app admin" in this project means "whoever deployed the app." It is not a user-facing concept and there is no planned phase for an app-admin management UI.

### ESPN client as a test seam

Tasks 2 and 3 make outbound HTTP requests. For the route tests to work without hitting the real ESPN API, all ESPN calls must go through a single module (`lib/espn.ts`) that Vitest can mock with `vi.mock()`. This is a firm prerequisite for Tasks 2 and 3 — see Task 0.

---

## Tasks

### 0. ESPN client module

**Status: Complete**

Create `lib/espn.ts` as the single boundary between the app and the ESPN API. This module is the test seam that makes Tasks 2 and 3 unit-testable without hitting the real API — nothing ESPN-related should be imported or fetched outside this file.

**Exports:**
- `fetchESPNSchedule(sport: string, season: string): Promise<ESPNGame[]>` — upcoming games for a sport/season
- `fetchESPNScoreboard(sport: string): Promise<ESPNGame[]>` — current/recent scores for a sport
- `ESPNGame` type: `{ id: string; homeTeam: string; awayTeam: string; scheduledAt: Date; status: "scheduled" | "in_progress" | "completed"; homeScore: number | null; awayScore: number | null }`

The sport → ESPN-path mapping (`NFL → football/nfl`, etc.) lives here. The ESPN response parsing (extracting team names, timestamps, scores from the raw JSON) lives here. Route handlers receive clean `ESPNGame[]` — they never touch raw ESPN JSON.

**Test fixtures:** Store one fixture file per endpoint type in `__tests__/fixtures/`: e.g. `espn-nfl-schedule.json`, `espn-nfl-scoreboard.json`. These feed the mocked functions in Task 2 and 3 route tests.

**Files added:**
- `lib/espn.ts` — ESPN client (types, parser, fetch functions)
- `lib/__tests__/espn.test.ts` — 28 unit tests
- `__tests__/fixtures/espn-nfl-schedule.json` — 2 scheduled games
- `__tests__/fixtures/espn-nfl-scoreboard.json` — 1 completed, 1 in-progress, 1 scheduled

**Schema changes:** None.
**API changes:** None.

---

### 1. ESPN game ID fields

**Status: Complete**

Add `espnId` to `SportGame` and `espnGameId` to `Game`. Update the slate game-population route (`POST /slates/[slateId]/games`) to copy `espnId → espnGameId` when creating `Game` rows from `SportGame` rows.

**Schema changes:**
- `SportGame`: add `espnId String? @unique`
- `Game`: add `espnGameId String?`

**API changes:** None visible to clients — the copy happens server-side.

**Files changed:**
- `prisma/schema.prisma` — added `espnId` and `espnGameId` fields
- `prisma/migrations/20260409000000_add_espn_ids/migration.sql` — migration (applied)
- `app/api/leagues/[leagueId]/slates/[slateId]/games/route.ts` — `createMany` now includes `espnGameId: sg.espnId ?? null`
- `app/api/leagues/[leagueId]/slates/[slateId]/games/__tests__/route.test.ts` — 2 new tests asserting `espnGameId` is copied; `espnId`/`espnGameId` added to fixtures

---

### 2. Schedule import

**Status: Complete**

Games are imported from ESPN per calendar date (not per season). Two entry points exist:

1. **League admin sync** — the primary path. League admins pick a date in their slate management panel; games sync directly into `SportGame` and appear for selection. No `APP_ADMIN_EMAILS` required.
2. **App-level bulk sync** — `/admin` page for operators; useful for pre-populating multiple sports at once.

ESPN's scoreboard endpoint uses `?dates=YYYYMMDD` (not `?season=YYYY`) — the season parameter caused 500 errors. Season is derived from the year portion of the date string.

**Auth:**
- League sync: session + league admin role.
- App-level sync: session + `APP_ADMIN_EMAILS` env var.
- Both return `401` with no session, `403` if role/email check fails.

**API:**

| Route | Auth | Notes |
|---|---|---|
| `POST /api/leagues/[leagueId]/slates/[slateId]/sync-espn` | session + league admin | Accepts `{ date: "YYYYMMDD" }`; reads league sport; calls `fetchESPNSchedule`; upserts SportGame rows; returns `{ inserted, updated }` |
| `POST /api/admin/sync-schedule` | session + `APP_ADMIN_EMAILS` | Accepts `{ sport, date: "YYYYMMDD" }`; same upsert logic; returns `{ inserted, updated }` |
| `GET /api/sport-games` | session | Now supports `?date=YYYYMMDD` in addition to `?season=`; filters `scheduledAt` to a 24-hour UTC window |

**UI:** The "Add games from schedule" panel on the league admin page has a date picker and a "Sync from ESPN" button. Picking a date loads existing games for that date; clicking Sync fetches from ESPN, upserts, and refreshes the list. Games can then be checked and added to the slate.

**Files changed/added:**
- `app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/route.ts` *(new)* — league admin sync endpoint
- `app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/__tests__/route.test.ts` *(new)* — 11 tests
- `app/api/admin/sync-schedule/route.ts` — updated: `season` param → `date` (YYYYMMDD), season derived from date, GET debug endpoint removed
- `app/admin/page.tsx` — season text input → date picker
- `app/api/sport-games/route.ts` — added `?date=YYYYMMDD` filter
- `app/api/admin/sync-schedule/__tests__/route.test.ts` — updated for date param
- `app/api/sport-games/__tests__/route.test.ts` — added date filter test
- `lib/espn.ts` — `fetchESPNSchedule` param renamed `date`; uses `?dates=YYYYMMDD`
- `lib/__tests__/espn.test.ts` — updated for date param
- `app/leagues/[leagueId]/admin/page.tsx` — redesigned add-games panel

**Schema changes:** None beyond Task 1.
**API changes:** New route; updated sport-games filter; sync-schedule body changed.

---

### 3. Score auto-sync

**Status: Not started**

A cron job that polls ESPN for in-progress and completed games, writes scores to matching `Game` rows, and triggers the existing slate-promotion logic automatically.

**Cron discovery query:**

The endpoint does not hard-code which sports to poll. It queries the DB for distinct sports that currently have active slates:

```sql
SELECT DISTINCT leagues.sport
FROM slates
JOIN leagues ON slates.leagueId = leagues.id
WHERE slates.status = 'active'
  AND leagues.sport IS NOT NULL
```

One `fetchESPNScoreboard` call is made per distinct sport. If two leagues both play NFL, only one ESPN request is made for the entire cron run.

**Score write logic:**
1. For each completed ESPN game, find matching `Game` rows by `espnGameId`.
2. If the matching `Game` is not already `"completed"`, update it with scores and `status: "completed"`.
3. After each update, call the existing `tryPromoteNextSlate` — it already guards against double-promotion via `wasAlreadyCompleted`.
4. Games without `espnGameId` are skipped silently.

**Re-entrancy and idempotency:**

The cron endpoint must be safe to call multiple times concurrently or in rapid succession:

- Vercel Cron may invoke the endpoint more than once per window during retries or cold starts.
- The score write is an `update` (not `create`), so calling it on an already-completed game is a no-op.
- `tryPromoteNextSlate` already has a `wasAlreadyCompleted` guard that prevents the slate from being promoted twice.
- The endpoint must return `200` (not an error status) when it runs and finds nothing to update — error statuses cause Vercel to retry, which creates unnecessary load.

**Auth:** `x-cron-secret` header checked against `CRON_SECRET` env var. Returns `401` if missing or wrong. Vercel Cron sends this header automatically when configured with the secret.

**Infrastructure:** `vercel.json` cron job configured to call `/api/cron/sync-scores` on a schedule (e.g. `*/5 * * * *` — every 5 minutes during game windows, or a less frequent schedule outside them).

**API:**

| Route | Auth | Notes |
|---|---|---|
| `POST /api/cron/sync-scores` | `x-cron-secret` header | Discovers active sports, polls ESPN, updates Game rows, triggers slate promotion; always returns `200` with a summary |

**Files changed:** `app/api/cron/sync-scores/route.ts` (new), `vercel.json` (new or updated)
**Schema changes:** None beyond Task 1.
**API changes:** New route only.

---

## Environment variables (additions)

Add these alongside the existing vars in `.env`:

| Variable | Purpose |
|---|---|
| `APP_ADMIN_EMAILS` | Comma-separated email addresses allowed to call `/api/admin/sync-schedule`. Example: `you@example.com,cofounder@example.com` |
| `CRON_SECRET` | Shared secret sent by Vercel Cron in the `x-cron-secret` header to authenticate `/api/cron/sync-scores`. Any strong random string. |

---

## Testing

### Strategy

Tasks 2 and 3 make outbound HTTP calls to the ESPN API. Vitest tests must not hit the real API — it is undocumented, potentially rate-limited, and makes tests environment-dependent. The test seam is `lib/espn.ts` (Task 0): route tests mock this module with `vi.mock('@/lib/espn')` and pass in fixture data instead.

This matches the existing pattern in the codebase: thin route handlers delegate to library code; tests mock the library and exercise the route logic.

### Per-task test scope

**Task 0 — ESPN client (`lib/espn.ts`)**

Do not write integration tests that hit the real ESPN API. Instead, write unit tests for the *parsing* logic: given a raw ESPN response fixture (stored as JSON), assert that `fetchESPNSchedule` / `fetchESPNScoreboard` return the correct `ESPNGame[]` shape. This validates the parser without network dependency.

Store fixtures in `__tests__/fixtures/`:
- `espn-nfl-schedule.json` — sample ESPN schedule response
- `espn-nfl-scoreboard.json` — sample ESPN scoreboard response with some completed games

**Task 1 — ESPN ID fields**

Extend the existing test in `app/api/leagues/[leagueId]/slates/[slateId]/games/__tests__/route.test.ts`:
- Seed a `SportGame` with a known `espnId`
- Call `POST /slates/[slateId]/games` with that `sportGameId`
- Assert the created `Game` row has `espnGameId` matching the source `espnId`

No new test file needed.

**Task 2 — Schedule import (`POST /api/admin/sync-schedule`)**

New file: `app/api/admin/sync-schedule/__tests__/route.test.ts`

Mock `lib/espn.ts`. Verify:
- Happy path: correct number of `SportGame` rows inserted; response body contains `{ inserted, updated }`
- Upsert is idempotent: calling twice with the same fixture data produces no duplicates and the second call returns `{ inserted: 0, updated: N }`
- `403` when `session.user.email` is not in `APP_ADMIN_EMAILS`
- `401` when unauthenticated
- `400` when `sport` is missing or not a valid sport key
- `400` when `season` is missing

**Task 3 — Score sync (`POST /api/cron/sync-scores`)**

New file: `app/api/cron/sync-scores/__tests__/route.test.ts`

Mock `lib/espn.ts` with a scoreboard fixture that has some completed games and some in-progress games. Seed matching `Game` rows (with `espnGameId` set). Verify:
- Completed games are updated with correct scores and `status: "completed"`
- In-progress games are not updated
- Games without `espnGameId` are skipped
- Slate promotion fires when all games in a slate are complete (assert slate `status` changes to `"completed"` and next slate becomes `"active"`)
- Calling the endpoint twice with the same fixture is a no-op on the second call (idempotency)
- `401` when `x-cron-secret` header is missing
- `401` when `x-cron-secret` value is wrong
- `200` with an appropriate summary body when there is nothing to sync

### Manual testing without Vercel

**Schedule import:** Open `/admin` in the dev browser. Click "Sync schedule" for a sport. Verify rows appear in Prisma Studio (`npx prisma studio`). Click again — confirm no duplicates (upsert working).

**Score sync:** Hit the cron endpoint directly with curl — no Vercel required:

```bash
curl -X POST http://localhost:3000/api/cron/sync-scores \
  -H "x-cron-secret: $(grep CRON_SECRET .env | cut -d= -f2)"
```

Check the response body for the sync summary. Verify updated `Game` rows in Prisma Studio.

---

## Schema changes required

| Change | Model | Field | Status |
|---|---|---|---|
| Add ESPN game ID | `SportGame` | `espnId String? @unique` | **Complete** |
| Add ESPN game ID | `Game` | `espnGameId String?` | **Complete** |

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| ESPN client module | **Yes** | `lib/espn.ts` — Task 0 complete |
| ESPN game ID on SportGame | **Yes** | `espnId String? @unique` — Task 1 complete |
| ESPN game ID on Game | **Yes** | `espnGameId String?` — Task 1 complete |
| Schedule import from ESPN | **Yes** | `POST /api/leagues/[leagueId]/slates/[slateId]/sync-espn` (league admin) + `POST /api/admin/sync-schedule` (app admin) — Task 2 complete |
| Score auto-sync | No | Manual admin score entry only |
| Cron infrastructure | No | No background jobs |
| App-level admin gating | No | `APP_ADMIN_EMAILS` env var not wired up yet |
