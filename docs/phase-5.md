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

**Risk:** this API is undocumented and can change without notice. It is suitable for prototyping and early production. If reliability becomes a concern, migrating to a paid provider (SportRadar, MySportsFeeds) would only affect the service layer introduced in this phase — no other app code would change.

---

## Key architectural decision: ESPN game ID

The score-sync cron needs to match ESPN game results back to `Game` rows in our database. Matching by team name is fragile (ESPN uses full names like "Kansas City Chiefs"; our DB stores whatever the admin entered). The reliable solution is to store the ESPN game ID at import time:

- Add `espnId String? @unique` to `SportGame`
- When admins add games to a slate from the SportGame table, copy `espnId` to the `Game` row (add `espnGameId String?` to `Game`)
- The score-sync cron matches by `espnGameId`

Games added manually (custom game lists, Phase 4 future feature) will have no `espnGameId` and are simply skipped by the cron.

---

## Tasks

### 1. ESPN game ID fields

**Status: Not started**

Add `espnId` to `SportGame` and `espnGameId` to `Game`. Update the slate game-population route (`POST /slates/[slateId]/games`) to copy `espnId` → `espnGameId` when creating `Game` rows from `SportGame` rows.

**Schema changes:**
- `SportGame`: add `espnId String? @unique`
- `Game`: add `espnGameId String?`

**API changes:** None visible to clients — the copy happens server-side.

---

### 2. Schedule import

**Status: Not started**

An admin-facing API route and UI button that fetches upcoming games from ESPN and upserts them into the `SportGame` table (match on `espnId`; update `scheduledAt`, `homeTeam`, `awayTeam` if changed; insert if new). Replaces the `npx prisma db seed` manual step.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `POST /api/admin/sync-schedule` | authenticated (app-level admin, not league admin) | Accepts `{ sport, season }`; calls ESPN; upserts SportGame rows; returns counts of inserted/updated |

**UI changes:**

- New admin utility page at `/admin` (app-level, not per-league) with a "Sync schedule" button per sport

---

### 3. Score auto-sync

**Status: Not started**

A cron job (Vercel Cron or equivalent) that runs every few minutes during game windows, polls ESPN for in-progress and completed games, and writes scores to matching `Game` rows. When all games in a slate are complete the existing slate-promotion logic fires automatically.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `POST /api/cron/sync-scores` | cron secret header | Fetches all sports with active slates; polls ESPN; updates `Game` rows where `espnGameId` matches and game is now complete; triggers slate promotion |

**Infrastructure:**

- Vercel Cron Job configured in `vercel.json` to call `/api/cron/sync-scores` on a schedule (e.g. every 5 minutes)
- `CRON_SECRET` environment variable to authenticate cron requests

---

## Schema changes required

| Change | Model | Details | Status |
|---|---|---|---|
| Add ESPN game ID | `SportGame` | `espnId String? @unique` | Not started |
| Add ESPN game ID | `Game` | `espnGameId String?` | Not started |

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| Schedule import from ESPN | No | Manual seed script only |
| ESPN game ID on SportGame | No | No external ID stored |
| Score auto-sync | No | Manual admin score entry only |
| Cron infrastructure | No | No background jobs |
