# Changelog

## 2026-07-10 (Add Sentry error monitoring)

**Why:** Phase 7 (friends test readiness) requires visibility into production errors without relying on friends to report bugs. Added via Sentry's Next.js setup wizard, with tunnel routing so ad-blockers don't silently drop client-side error reports.

**`next.config.ts`**: Wrapped config with `withSentryConfig`; `tunnelRoute: "/monitoring"` routes browser-side error reports through the app's own domain instead of directly to Sentry's ingest endpoint, which ad-blockers commonly block.

**`instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`** *(new)*: Sentry SDK initialization for the server, edge, and client runtimes.

**`app/global-error.tsx`** *(new)*: Root error boundary that reports uncaught React render errors to Sentry.

**`package.json`**: Added `@sentry/nextjs`.

## 2026-04-11 (Fix: slate promotion stuck when games lack espnGameId or cron missed past-date completions)

**Why:** Three compounding bugs prevented the MLB slate from promoting: (1) Games created from SportGame records that were missing `espnId` at creation time have `espnGameId = null`, so the cron's primary ID-based lookup returns nothing and those games stay "scheduled" forever, blocking the promotion count check. (2) The past-date deduplication merged today's potentially stale "in_progress" status over yesterday's correct "completed" status. (3) No admin escape hatch existed to manually complete a stuck slate.

**`app/api/cron/sync-scores/route.ts`**: Added team-name + calendar-day fallback match: if `prisma.game.findMany({ where: { espnGameId } })` returns nothing, a second query matches by `homeTeam`, `awayTeam`, and `startTime` within the same UTC day, scoped to active-slate games. On a fallback hit, `espnGameId` is backfilled in the same update so future runs use the fast path. Fixed deduplication order: past-date games are now prepended before today's scoreboard results, so the completed past-date version of a game takes priority over any stale "in_progress" version still appearing in today's feed.

**`app/api/leagues/[leagueId]/slates/[slateId]/promote/route.ts`** *(new)*: `POST` — admin-only break-glass endpoint. Verifies all games in the slate are completed (returns 400 with incomplete game list if not), then marks the slate as "completed" and activates the next slate by position.

**`app/leagues/[leagueId]/admin/page.tsx`**: Added "Force complete & promote" button visible on active slates. Calls the promote endpoint, shows which games still need scores if any are unscored, and updates local slate state on success.

## 2026-04-11 (Fix: cron score sync missed completed games from previous calendar days)

**Why:** `fetchESPNScoreboard` fetches today's scoreboard with no date parameter. Games that finished yesterday (or earlier) are no longer in that response, so the cron never marked them as completed, slate promotion never fired, and the next slate stayed `upcoming` indefinitely. Reproduced with MLB slates spanning a day boundary.

**`app/api/cron/sync-scores/route.ts`**: Added past-date back-fill. The `slate.findMany` query now includes unscored games via `include: { games: { where: { status: { not: "completed" } }, select: { startTime } } }`. Before the sport loop, we build a `sportPastDates` map of `sport → Set<YYYYMMDD>` for any unscored game whose `startTime` is before today. In the sport loop, after fetching today's scoreboard with `fetchESPNScoreboard`, we additionally call `fetchESPNSchedule(sport, date)` for each past date (failures are silently skipped). Results are deduplicated by ESPN game ID before processing, so a game that spans a day boundary is only scored once.

**`app/api/cron/sync-scores/__tests__/route.test.ts`**: Added `fetchESPNSchedule` to the ESPN mock. Added `games: []` to existing slate fixtures. Added 3 new tests: fetches past-date scoreboard when unscored past games exist, does not call `fetchESPNSchedule` when all games are today or future, and continues gracefully when a past-date ESPN fetch fails.

## 2026-04-11 (Phase 6A+B: Auto-slate creation for NFL and NCAAF)

**Why:** Admins had to manually enter a date, sync ESPN, select individual games, and create slates by hand every week. For NFL and college football this is unnecessary — every week's games are known in advance and the week/season are unambiguous. Automating slate creation reduces weekly admin burden to one click with a preview step.

**`lib/football.ts`** *(new)*: Football-specific constants and utilities. `NCAAF_CONFERENCES` — array of ESPN group IDs for the 10 major FBS conferences (ACC, Big 12, Big Ten, SEC, AAC, C-USA, MAC, MWC, Sun Belt, FBS Independents). `FBS_GROUP_ID = 80` for unfiltered FBS fetches. `inferFootballSeason()` — returns the current season year (Aug–Dec → current year, Jan–Jul → prior year). `weekSlateName(leagueName, week)` — formats canonical slate names as `"[League Name] – Week [N]"`.

**`lib/espn.ts`**: Refactored `fetchAndParse` into two layers: `httpFetch(url)` (retry logic, returns Response) and `fetchAndParse(url)` (calls httpFetch, parses ESPNGame[]). Added `ESPNWeekInfo` export type. Added `fetchESPNCurrentWeek(sport)` — fetches the current scoreboard and extracts `week.number` + `season.year` from ESPN's metadata. Added `fetchESPNWeeklyGames(sport, week, season, conferenceIds?)` — fetches all games for a specific NFL or NCAAF week; for NCAAF with conference IDs, makes one request per conference via `Promise.allSettled` and merges + deduplicates results by ESPN game ID (failed conferences are skipped rather than failing the whole request).

**`app/api/leagues/[leagueId]/slates/auto-preview/route.ts`** *(new)*: Two handlers on the same route. `GET` — returns `{ weekNumber, season, seasonType }` from ESPN's current scoreboard (used to seed the week selector in the admin UI). `POST` — body `{ week, season, conferences? }` → calls `fetchESPNWeeklyGames` → upserts into `SportGame` (same logic as sync-espn) → returns `{ slateName, weekNumber, season, sportGames[] }`. NFL and NCAAF only; `conferences` is ignored for NFL. Rate-limited to 20 calls/min per user.

**`app/api/leagues/[leagueId]/slates/auto-create/route.ts`** *(new)*: `POST` — body `{ name, sportGameIds[] }` → validates games exist and match league sport → auto-computes next `position` and `status` (active if no active slate, upcoming otherwise) → creates Slate + all Game rows in a single `$transaction` → returns `{ slate, games }`.

**`app/leagues/[leagueId]/admin/page.tsx`**: Added `NCAAF_CONFERENCES` import. Added "Auto-create Slate" panel (rendered only for NFL/NCAAF leagues) above the slates list. Clicking the button calls the `GET auto-preview` endpoint to seed the week selector, then shows: week navigator (← Week N →, capped 1–22), season year input, conference checkboxes (NCAAF only, styled as toggle cards), "Preview Games" button, a scrollable deselectable game list (select/deselect all controls included), editable slate name pre-filled from `weekSlateName`, and "Create Slate with N games" button. On success, the new slate is prepended to the list and the panel closes.

**`lib/__tests__/espn.test.ts`**: Added 9 tests for `fetchESPNCurrentWeek` (current week parse, fallback, URL shape, error propagation) and `fetchESPNWeeklyGames` (NFL URL, NCAAF all-FBS, multi-conference merge, dedup, conference failure resilience).

**`app/api/.../auto-preview/__tests__/route.test.ts`** *(new)*: 20 tests covering GET and POST handlers — auth, admin guard, sport guard, input validation, ESPN success/empty/error, insert vs update paths, conference ID forwarding.

**`app/api/.../auto-create/__tests__/route.test.ts`** *(new)*: 13 tests — auth, admin guard, input validation, sport mismatch, position computation (next = max+1), status selection (active vs upcoming), transaction result shape.

Test count: 282 → 324 (all passing). No schema changes.

---

## 2026-04-11 (ESPN reliability: retry logic + manual score override)

**Why:** ESPN's API is undocumented and has no SLA. Transient 5xx/429 errors during live games would silently skip the score-sync cron and leave picks unscored. Additionally, removing manual score entry in the previous session left no fallback if the cron fails entirely — admins had no way to unblock a slate mid-game.

**`lib/espn.ts`**: `fetchAndParse` now retries up to 3 total attempts (1 initial + 2 retries) with exponential backoff (1 s → 2 s → 4 s). Retries on HTTP 5xx and 429; does not retry on other 4xx client errors (those indicate a bug in our request, not a transient failure). Network-level errors (DNS, connection refused) are always retried. Applies to both `fetchESPNSchedule` and `fetchESPNScoreboard` since both go through `fetchAndParse`.

**`lib/__tests__/espn.test.ts`**: Rewrote HTTP-error tests to use `vi.useFakeTimers()` so retry delays are instant in tests. Removed the two old "throws on non-ok status" tests (503, 429) that would have been slow and mis-tested retry counts; replaced with a "no retry on 4xx" assertion. Added 6 new retry tests: persistent 503 exhausts 3 attempts, persistent 429 exhausts 3 attempts, success on 2nd attempt after transient 503, success on 3rd attempt after two 503s, retry on network error then success, network error exhausts all attempts.

**`app/leagues/[leagueId]/admin/page.tsx`**: Re-added manual score entry as a collapsible break-glass control per pending game. By default each pending game shows a subtle "Override score manually" text link. Clicking it expands an amber-tinted form with a warning ("only use if ESPN sync has failed"), away/home score inputs, and a "Save Final Score" button. Submits via the existing `PATCH /api/leagues/[leagueId]/games/[gameId]` endpoint; on success the game immediately shows "Final: A–H" in the admin view and slate-promotion logic runs as usual.

Test count: 276 → 282 (all passing).

---

## 2026-04-11 (Create League dialog with description, member limit, and visibility)

**Why:** The previous "Create League" flow navigated to a separate `/leagues/new` page with only two fields (name + sport). A modal dialog keeps users in context (no full-page navigation), and the expanded field set — description, member cap, and private/public toggle — gives league creators meaningful control before inviting anyone.

**`prisma/schema.prisma`**: Added three optional columns to `League`: `description String?`, `maxMembers Int?`, `isPrivate Boolean @default(true)`. Migration applied: `20260411133614_add_league_description_maxmembers_isprivate`.

**`app/api/leagues/route.ts`**: POST handler now reads and validates `description` (trimmed, max 300 chars), `maxMembers` (integer 2–500 or null for unlimited), and `isPrivate` (boolean, defaults to `true`). All three fields are written to the new DB columns.

**`app/components/create-league-dialog.tsx`** *(new)*: Modal dialog component for league creation. Features: dark overlay with backdrop-blur, close on Escape or backdrop click, body scroll lock while open. Form fields: league name (text input), sport (3×2 emoji grid selector), description (textarea with 300-char counter), member limit (toggle + number input), visibility (Private/Public button pair). Submit button disabled until name and sport are both filled. Accepts `open`, `onClose`, and optional `onCreated` callback — if `onCreated` is provided the dialog stays in-page and calls back with the new league; otherwise it navigates to the league page.

**`app/page.tsx`**: Both "Create League" triggers (header `+ New` button and empty-state button) now open the `<CreateLeagueDialog>` instead of linking to `/leagues/new`. A `useEffect` detects `?create=1` in the URL and auto-opens the dialog (used by the `/leagues/new` redirect). League list cards now show member count with optional cap (`4 / 10`) and a truncated description line below the name.

**`app/leagues/new/page.tsx`**: Replaced the old form page with a one-liner redirect to `/?create=1` so any bookmarked or external links to `/leagues/new` still open the dialog.

No API contract changes beyond the three new optional POST fields. All 276 tests still passing.

---

## 2026-04-10 (Eliminate admin score entry; W-L record display)

**Why:** Scores are now auto-synced from ESPN via the cron job — there is no need for admins to manually enter them. Manual entry was also a source of error (wrong values could break pick scoring). Additionally, displaying a raw correct-pick count gives no sense of context; showing a W-L record (e.g. "12-5") is the sports-standard way to communicate a player's standing.

**`app/leagues/[leagueId]/admin/page.tsx`**: Removed all manual score-entry UI — the score input fields, the Save/Update buttons, the `scores` state, and the `savingScore` state + `handleSaveScore` handler. Completed games now show a read-only "Final: A–H" badge. Pending games show a "· Score syncs automatically via ESPN" hint so admins understand why there are no inputs.

**`app/leagues/[leagueId]/leaderboard/page.tsx`**: Replaced the "Correct" column with "Record" (W-L format, e.g. `12-5`). The "Picked" column is replaced with "Pct" (win percentage, e.g. `70.6%`, hidden on mobile). Both values use `tabular-nums` for aligned rendering.

**`app/profile/[userId]/page.tsx`**: Updated the 3-stat hero grid — "Correct picks" card now shows the W-L record (e.g. `12-5`) with label "Record (W-L)". In the per-league stats table, the "Correct"/"Total" columns are replaced with "Record" (W-L) and "Pct" (win %); the "Total" column is still shown but hidden on mobile.

No schema changes. No API changes. All 276 tests still passing.

---

## 2026-04-10 (Phase 5: completed game score + pick result display)

**Why:** Completed games showed no score and no pick result (correct/wrong) because the live endpoint only returned in-progress games, and the cron hadn't yet written scores to the DB. Users had no feedback on their picks until a manual page refresh after the cron ran.

**`app/api/leagues/[leagueId]/games/live/route.ts`**: Changed the ESPN game filter from `status === "in_progress"` to `status !== "scheduled"`. Completed ESPN games are now included in the live response with their final scores. Scheduled games (not yet started) are still excluded.

**`app/leagues/[leagueId]/page.tsx`**: Updated game card rendering to handle scores from either source (DB or ESPN live data):
- `isEspnFinal` — true when the live poll returns `status: "completed"` for a game
- `isCompleted` — now true if DB status is completed OR ESPN reports it complete
- `effectiveHomeScore` / `effectiveAwayScore` — prefer DB values (written by cron), fall back to ESPN live scores
- `winner` — recalculated using effective scores
- Header: completed games now show `Final 2–5` (away–home) instead of just "Final"
- Buttons: correct pick highlighted green, wrong pick red, loser team dimmed; score shown in parentheses per team
- Updated `getWinner` signature to take scores directly rather than a Game object

**`app/api/leagues/[leagueId]/games/live/__tests__/route.test.ts`**: Updated "omits completed" test → "includes completed with final score"; added "omits scheduled" test.

Test count: 275 → 276 (all passing).

---

## 2026-04-10 (Phase 5: espnGameId backfill on ESPN sync)

**Why:** Games added to a slate before the ESPN ID flow was wired through had `espnGameId = null`, preventing live score polling and cron-based score sync from matching them. Deleting and re-adding games would wipe user picks.

**`app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/route.ts`**: After upserting `SportGame` rows, now also queries the current slate for `Game` rows where `espnGameId` is null. For each such game, looks up a matching row in the just-synced `SportGame` set by `homeTeam + awayTeam` and writes the `espnId` back onto the `Game` row. Picks are untouched — only the `espnGameId` column is updated. Re-syncing from ESPN now also heals pre-existing game rows.

**`app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/__tests__/route.test.ts`**: Added `prisma.game` to the mock; added `beforeEach` default (no unlinked games); renamed `mockUpdate` → `mockSportGameUpdate` to avoid ambiguity; added 4 backfill tests (writes correct ID, backfills all matches, skips non-matching teams, skips Game query when ESPN returns nothing).

Test count: 271 → 275 (all passing).

---

## 2026-04-10 (Phase 5: live score + completed score UI auto-refresh)

**Why:** The picks page had no mechanism to pick up scores written by the cron job or transitions from in-progress to completed. Users had to manually refresh to see the FINAL badge and scores after a game ended.

**`app/leagues/[leagueId]/page.tsx`**: Rewrote the live-polling `useEffect`.
- Added `slateGamesRef` (a `useRef` that mirrors `slateGames`) so the polling function can read the current game list without putting `slateGames` in the effect's dep array (which would restart the interval on every poll cycle and cause an infinite loop).
- The poll now fetches both `/games/live` and `/slates/:id/games` in parallel. Live scores drive the LIVE badge (real-time ESPN data); the games re-fetch picks up `status: "completed"` and final scores written by the cron (drives the FINAL badge and score display in the pick buttons).
- Dep array changed from `[slateGames, slateInfo, leagueId]` to `[slateInfo?.id, slateInfo?.status, leagueId]` so the interval only restarts on a real slate change, not on data updates.
- Polling stops automatically once the slate transitions to `"completed"` (all games done).

---

## 2026-04-10 (Phase 5 Task 3: score auto-sync cron)

**Why:** Admins were manually entering game scores via the `PATCH /api/leagues/[leagueId]/games/[gameId]` endpoint. This was error-prone and slow. The score-sync cron automatically polls ESPN for completed games and writes scores back to matching `Game` rows, triggering the existing slate-promotion logic automatically.

**`app/api/cron/sync-scores/route.ts`** *(new)*: `POST` handler authenticated via `x-cron-secret` header (checked against `CRON_SECRET` env var). Logic:
1. Discovers distinct sports that currently have active slates via a `Slate` + `League` join query.
2. Calls `fetchESPNScoreboard(sport)` once per distinct sport.
3. For each completed ESPN game, finds matching `Game` rows by `espnGameId`. Skips games already marked `"completed"` (idempotency). Updates matching rows with `homeScore`, `awayScore`, `status: "completed"`.
4. After each update, calls `tryPromoteNextSlate` to trigger slate promotion if all games in the slate are now complete.
5. Always returns `200` with `{ synced, updated, sports }` summary — error statuses would cause Vercel to retry unnecessarily.
6. ESPN errors for a single sport are swallowed (sport skipped, others continue).

**`app/api/cron/sync-scores/__tests__/route.test.ts`** *(new)*: 16 tests covering auth (missing header, wrong secret, missing env var), no-active-slates short-circuit, completed/in-progress/scheduled game discrimination, games without `espnGameId` skipped, idempotency, slate promotion fires / doesn't fire, multi-sport deduplication, ESPN error resilience (one sport fails, others continue).

**`vercel.json`** *(new)*: Configures Vercel Cron to call `POST /api/cron/sync-scores` every 5 minutes (`*/5 * * * *`).

Test count: 255 → 271 (all passing).

---

## 2026-04-10 (Phase 4: slate navigation on picks tab)

**Why:** Users in leagues with multiple slates (e.g. one per day) could only see the active slate. Completed slates were buried in a separate "Past Slates" section and upcoming slates were invisible entirely, which made the question "when do I see the next slate?" unanswerable from the UI.

**`app/api/leagues/[leagueId]/slates/[slateId]/games/route.ts`**: Added `lockDeadline` to the GET response slate object. Computed the same way as the active-games endpoint: 30 minutes before the earliest game `startTime` in the slate, or `null` if no games exist. This enables correct pick-locking display for non-active (upcoming) slates.

**`app/leagues/[leagueId]/page.tsx`**: Complete rework of the picks page data flow and navigation.
- Initial load now fetches league + all slates + leaderboard in parallel (removed the separate active-games fetch).
- A second `useEffect` on `viewIndex` fetches games and tiebreakers for the currently viewed slate via `GET /api/leagues/[leagueId]/slates/[slateId]/games` and resets state on navigation.
- Defaults to the active slate; falls back to the first slate if no active one exists.
- Navigation header: `‹` / `›` arrow buttons with the slate name and status label (`Active` / `Final` / `Upcoming`) between them. Arrows are disabled at the boundaries.
- Going right from the last slate (or when no slates exist past the active one) shows a "No Upcoming Slate — Check back later" empty state.
- A subtle loading skeleton (pulse animation) is shown while a new slate's data loads.
- "Past Slates" section removed — all slate navigation is now through the arrow UI.
- Live score polling restricted to the active slate.

**`app/api/leagues/[leagueId]/slates/[slateId]/games/__tests__/route.test.ts`**: Added 2 new tests for `lockDeadline` — one asserting it is 30 minutes before the earliest game, one asserting it is `null` when the slate has no games.

Test count: 253 → 255 (all passing).

---

## 2026-04-10 (Phase 5: live score badges)

**Why:** Users watching games in real time had no indication of the current score or game state while the picks page was open. This adds a live badge with a pulsing dot, sport-specific state string (e.g. "Bot 7th", "2nd - 14:32"), and running score to each in-progress game card.

**`lib/espn.ts`**: Extended `ESPNGame` type with `clock: string | null`, `period: number | null`, `shortDetail: string | null`. Extended `RawEvent` internal type to expose `status.displayClock`, `status.period`, `status.type.shortDetail` from ESPN's raw payload. Updated `parseESPNEvents` to extract scores for both `completed` and `in_progress` games (previously only `completed`). Live state fields populated for `in_progress` games; `null` for all other statuses.

**`app/api/leagues/[leagueId]/games/live/route.ts`** *(new)*: `GET` handler, auth + member guard. Fetches active slate's games with `espnGameId` that aren't yet completed, calls `fetchESPNScoreboard`, returns `{ [gameId]: LiveScoreEntry }` for in-progress matches only. Returns `{}` gracefully on no sport, no active slate, no eligible games, or ESPN error (silent-fail pattern for polling).

**`app/leagues/[leagueId]/page.tsx`**: Added `LiveScore` type and `liveScores: Record<string, LiveScore>` state. Second `useEffect` polls `/api/leagues/${leagueId}/games/live` every 45 s, starting only when a slate game has an `espnGameId` and isn't completed; clears on unmount. Game card header now shows a pulsing `LIVE` badge + `shortDetail` + score (`away–home`) when a live score entry exists. Completed `FINAL` badge and in-button score display unchanged. Added `espnGameId: string | null` to the `Game` type.

**`__tests__/fixtures/espn-mlb-scoreboard.json`** *(new)*: MLB fixture with one in-progress game (`displayClock`, `period: 7`, `shortDetail: "Bot 7th"`), one completed, one scheduled.

**`lib/__tests__/espn.test.ts`**: Updated `"returns null scores for in-progress games"` → `"extracts live scores for in-progress games"` (Cowboys 14, Giants 7 now populated). Added 6 new tests: null clock/period/shortDetail when fields absent; null for completed/scheduled; MLB fixture describe block (4 tests).

**`app/api/leagues/[leagueId]/games/live/__tests__/route.test.ts`** *(new)*: 10 tests — 401, 403, no sport, no active slate, no espnGameIds (ESPN not called), ESPN throws (silent `{}`), correct LiveScoreEntry mapping, game absent from ESPN response, extra ESPN games ignored, ESPN-completed game omitted.

Test count: 237 → 253 (all passing).

---

## 2026-04-10 (Phase 4: delete league)

**Why:** League admins needed a way to permanently remove a league they no longer want. Previously there was no delete path — leagues could only be renamed or settings changed.

**`app/api/leagues/[leagueId]/route.ts`**: Added `DELETE` handler. Requires an authenticated session and that the caller is a league `admin` (403 otherwise). Calls `prisma.league.delete()`, which cascades to all related records (LeagueMember, Slate, Game, Pick, TiebreakerQuestion, TiebreakerResponse) via existing `onDelete: Cascade` schema rules. Returns `{ success: true }` on completion.

**`app/leagues/[leagueId]/settings/page.tsx`**: Added a "Danger Zone" section at the top of the settings page. Contains a confirmation text input — the admin must type the exact league name before the "Delete League" button becomes enabled. On success, the user is redirected to `/` (home).

**`app/api/leagues/[leagueId]/__tests__/route.test.ts`**: Added 4 tests for the DELETE handler: 401 unauthenticated, 403 non-member, 403 non-admin member, 200 admin success (asserts `prisma.league.delete` called with correct `where`). Updated the `prisma` mock to include `league.delete`.

Test count: 233 → 237 (all passing).

---

## 2026-04-09 (Phase 5: date-based ESPN sync + league-context sync-espn endpoint)

**Why:** ESPN's scoreboard endpoint does not reliably support a bare `season` year parameter — passing `?season=2026` returned 500 errors. Switched to `?dates=YYYYMMDD`, which is a known working parameter. At the same time, moved the primary sync UX from the app-level `/admin` page into the league admin panel so league admins can populate slates directly without needing app-level credentials.

**`lib/espn.ts`**: `fetchESPNSchedule(sport, date)` now accepts an 8-digit date string (`YYYYMMDD`) and passes it to ESPN as `?dates=YYYYMMDD`. Previously accepted a season year and used `?season=`. `fetchESPNScoreboard` is unchanged.

**`app/api/admin/sync-schedule/route.ts`**: Accepts `{ sport, date }` in the request body (was `{ sport, season }`). Validates `date` as `/^\d{8}$/`. Derives `season` from `date.substring(0, 4)` for `SportGame.season` storage. Removed the temporary GET debug endpoint.

**`app/admin/page.tsx`**: Season text input replaced with a `<input type="date">` picker. Converts `YYYY-MM-DD` → `YYYYMMDD` before sending to the API.

**`app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/route.ts`** *(new)*: `POST` handler callable by league admins (no `APP_ADMIN_EMAILS` required). Reads the league's `sport` from the DB, accepts `{ date: "YYYYMMDD" }`, calls `fetchESPNSchedule`, upserts into `SportGame`, returns `{ inserted, updated }`. Same upsert logic as the app-admin route.

**`app/api/sport-games/route.ts`**: Added optional `?date=YYYYMMDD` query param that filters `scheduledAt` to a 24-hour UTC window (`gte: startOfDay, lt: startOfNextDay`). Existing `?season=` and bare `?sport=` still work unchanged.

**`app/leagues/[leagueId]/admin/page.tsx`**: "Add games from schedule" panel redesigned:
- Date picker at the top (no pre-loaded game list)
- Selecting a date auto-fetches existing `SportGame` rows for that date from `GET /api/sport-games?sport=…&date=…`
- "Sync from ESPN" button calls the new `POST /api/leagues/[leagueId]/slates/[slateId]/sync-espn` endpoint, then refreshes the game list
- Inline sync result feedback ("Synced: N new, N updated")
- Game list and "Add N games" submit button appear below once games are available

**Tests updated/added:**
- `lib/__tests__/espn.test.ts`: updated `fetchESPNSchedule` tests to assert `dates=YYYYMMDD` param
- `app/api/admin/sync-schedule/__tests__/route.test.ts`: updated all `season` → `date` in bodies; added YYYYMMDD format validation test; updated season-derivation assertion
- `app/api/sport-games/__tests__/route.test.ts`: added test for `?date=YYYYMMDD` filter (asserts correct `gte`/`lt` range passed to Prisma)
- `app/api/leagues/[leagueId]/slates/[slateId]/sync-espn/__tests__/route.test.ts` *(new)*: 11 tests covering 401/403 auth, missing/invalid date, ESPN 502, all-insert, season-derivation, idempotency, empty ESPN response

Test count: 221 → 233 (all passing).

## 2026-04-09 (Phase 5 Task 2: schedule import — POST /api/admin/sync-schedule + /admin UI)

**`app/api/admin/sync-schedule/route.ts`** *(new)*: `POST` handler for importing ESPN schedule data into the `SportGame` table.

- **Auth**: `isAppAdmin()` reads `APP_ADMIN_EMAILS` env var (comma-separated), compares case-insensitively to `session.user.email`. Returns `401` if unauthenticated, `403` if not in the allow-list or if the env var is absent/empty.
- **Validation**: `400` if `sport` is missing, not a valid sport key, or if `season` is missing/blank.
- **ESPN fetch**: calls `fetchESPNSchedule(sport, season)` from `lib/espn.ts`; returns `502` with the ESPN error message if the fetch throws.
- **Upsert**: queries existing `SportGame` rows by `espnId` to split ESPN results into inserts vs updates. New rows go to `createMany`; existing rows go to individual `update` calls (updating `homeTeam`, `awayTeam`, `scheduledAt` only — sport and season are not overwritten on update). Returns `{ inserted: N, updated: N }`. Short-circuits to `{ inserted: 0, updated: 0 }` if ESPN returns an empty list, skipping all DB calls.

**`app/admin/page.tsx`** *(new)*: App-level admin page at `/admin`.
- Season text input (defaults to current year).
- One row per sport with individual Sync button; "Sync all sports" button to trigger all at once.
- Per-sport inline feedback: syncing spinner text, green "✓ N inserted, N updated" on success, red error message on failure.
- Redirects to `/login` if unauthenticated.

**`app/api/admin/sync-schedule/__tests__/route.test.ts`** *(new)*: 20 tests. Mocks `@/lib/session`, `@/lib/db`, and `@/lib/espn`. Uses `process.env.APP_ADMIN_EMAILS` set in `beforeEach` and deleted in `afterEach`. Covers: auth (401, 403, empty env, whitespace-only env, null email, case-insensitive match, multi-email list), validation (missing sport, invalid sport, missing season, blank season, all six valid sports), ESPN errors (502 on throw, non-Error throw), and upsert logic (all-insert, mixed insert+update, all-update idempotency, empty ESPN response, correct field values to `createMany` and `update`).

Test count: 201 → 221 (all passing).

## 2026-04-09 (Phase 5 Task 1: ESPN game ID fields — schema migration)

**`prisma/schema.prisma`**: Added two nullable fields:
- `SportGame.espnId String? @unique` — ESPN's stable event ID stored at schedule-import time; unique constraint prevents duplicate imports of the same ESPN event
- `Game.espnGameId String?` — copied from `SportGame.espnId` when an admin adds games to a slate; used by the score-sync cron to match ESPN results back to `Game` rows; games added manually (not from SportGame) have `null` and are skipped by the cron

**`prisma/migrations/20260409000000_add_espn_ids/migration.sql`** *(new)*: `ALTER TABLE "SportGame" ADD COLUMN "espnId" TEXT` + `ALTER TABLE "Game" ADD COLUMN "espnGameId" TEXT` + `CREATE UNIQUE INDEX "SportGame_espnId_key"`. Applied to the Neon dev database via `prisma migrate deploy`.

**`app/api/leagues/[leagueId]/slates/[slateId]/games/route.ts`**: `createMany` now includes `espnGameId: sg.espnId ?? null` — the ESPN ID flows from `SportGame` into `Game` at slate-population time with no visible API change.

**`app/api/leagues/[leagueId]/slates/[slateId]/games/__tests__/route.test.ts`**: Added `espnId` to `fakeSportGames` (one with a value, one `null`) and `espnGameId` to `fakeCreatedGames`. Added two new tests: one asserting `createMany` is called with `espnGameId` matching the source `espnId`, one asserting `espnGameId: null` when the source has no `espnId`.

Test count: 199 → 201 (all passing).

## 2026-04-09 (Phase 5 Task 0: ESPN client module — lib/espn.ts)

**`lib/espn.ts`** *(new)*: ESPN API client — the single boundary between the app and ESPN's public scoreboard API. No other file should fetch from ESPN directly.

- `ESPNGame` type: `{ id, homeTeam, awayTeam, scheduledAt, status, homeScore, awayScore }`
- `ESPNGameStatus`: `"scheduled" | "in_progress" | "completed"`
- `ESPN_PATHS` map: all 6 sports → ESPN scoreboard path segments
- `parseESPNEvents(raw)`: pure function converting raw ESPN JSON → `ESPNGame[]`; exported for unit testing without HTTP. Skips events missing a competition or a home/away competitor. Maps `completed: true` → `"completed"`, `STATUS_IN_PROGRESS / STATUS_HALFTIME / STATUS_END_PERIOD` → `"in_progress"`, everything else → `"scheduled"`. Scores set to `null` for non-completed games and on parse failure.
- `fetchESPNSchedule(sport, season)`: fetches schedule with `?limit=100&season=X`; intended for schedule-import admin route (Task 2)
- `fetchESPNScoreboard(sport)`: fetches current scoreboard with `?limit=100`; intended for score-sync cron (Task 3)
- Both fetch functions throw a descriptive `Error` on non-ok HTTP responses.

**`lib/__tests__/espn.test.ts`** *(new)*: 28 unit tests covering schedule fixture parsing, scoreboard fixture parsing (all three statuses), live status variants (STATUS_HALFTIME, STATUS_END_PERIOD, STATUS_FINAL_OT), edge cases (empty events, missing competition/competitor, unparseable scores), URL construction per sport, and HTTP error handling via `vi.stubGlobal('fetch', ...)`.

**`__tests__/fixtures/espn-nfl-schedule.json`** *(new)*: 2 STATUS_SCHEDULED games; used by the parser tests and will be reused by Task 2 route tests.

**`__tests__/fixtures/espn-nfl-scoreboard.json`** *(new)*: 1 STATUS_FINAL (with scores 27–20), 1 STATUS_IN_PROGRESS, 1 STATUS_SCHEDULED; used by parser tests and will be reused by Task 3 route tests.

Test count: 171 → 199 (all passing).

## 2026-04-09 (docs: phase 5 plan finalized — decisions, testing strategy, cron notes)

**`docs/phase-5.md`**: Significantly expanded before implementation begins.
- **Task 0 added** (`lib/espn.ts`): explicit prerequisite task to create the ESPN client module as a test seam before Tasks 2 and 3. All ESPN HTTP calls live here; route handlers never touch raw ESPN JSON; Vitest mocks this module with fixtures.
- **App-level admin gating decided**: `APP_ADMIN_EMAILS` env variable (comma-separated email list checked server-side against `session.user.email`). Rationale: no User model change needed, no migration, no chicken-and-egg deployment problem; "app admin" is an operational concern with no planned UI, not a user-facing feature.
- **Cron discovery logic specified**: `POST /api/cron/sync-scores` queries for distinct sports that have active slates (one ESPN fetch per sport, not per league) before making any outbound calls.
- **Re-entrancy and idempotency requirements added to Task 3**: cron must return `200` (not an error) when nothing changes (prevents Vercel retry loops); score writes are `update` not `create` (safe to re-run); slate promotion guards already exist (`wasAlreadyCompleted`).
- **Testing section added**: per-task scope table; fixture JSON strategy; manual curl command for testing the cron endpoint locally without Vercel.

**`docs/architecture.md`**: Added sections for ESPN API client (`lib/espn.ts`), app-level admin pattern (`APP_ADMIN_EMAILS`), and cron job infrastructure. Updated key directories list to include `app/api/admin/`, `app/api/cron/`, and `app/admin/`.

**`CLAUDE.md`**: Added `APP_ADMIN_EMAILS` and `CRON_SECRET` to env vars; added Phase 5 routes to API table; updated `SportGame` and `Game` data model descriptions to include `espnId`/`espnGameId`; added `lib/espn.ts` to key libraries; updated phase status to reflect Phases 3 and 4 complete.

## 2026-04-09 (UI: homepage hero + league page podium leaderboard)

**`app/page.tsx`**: Redesigned both authenticated and unauthenticated states.
- Unauthenticated: Full-screen hero with a decorative background emoji grid, gradient "LockHub" wordmark, feature highlight trio, and a shadow-accented CTA button. Replaces the previous minimal centered text.
- Authenticated: Added a welcome banner card (gradient from slate to blue-950, trophy decoration, personalized greeting with first name, league count blurb). League cards now have a sport emoji icon badge and a hover arrow indicator. Create/Join buttons moved to the section header for better scannability. Empty state includes a trophy emoji.

**`app/components/podium.tsx`** *(new)*: `PodiumDisplay` component — SVG-based pixel art Olympic podium showing top 3 league members. Figures are 12×14 viewBox pixel art (arms raised in victory pose) rendered at 5× scale with `shapeRendering="crispEdges"`. Arrangement follows the Olympic convention: 2nd left, 1st center (tallest block), 3rd right. Colors: gold (#f59e0b) for 1st, silver-slate (#94a3b8) for 2nd, bronze (#b45309) for 3rd. Score (correct/total) shown above each figure; name truncated below; podium block height reflects place. Links to the full leaderboard page.

**`app/leagues/[leagueId]/page.tsx`**: Added overall leaderboard fetch (`/api/leagues/${leagueId}/leaderboard`) to the existing `Promise.all` on mount. Top 3 entries stored in state and passed to `PodiumDisplay`, which renders above the active slate section. Renders nothing if no picks have been scored yet (empty entries array).

## 2026-04-09 (fix: background color now responds to theme changes)

**`app/globals.css`**: Added `--background` and `--foreground` overrides to each `html[data-theme="X"]` block. The `body` rule uses `background: var(--background)` directly (not a Tailwind utility), so overriding only `--color-slate-950` in the theme blocks left the page background stuck at the default `#0f172a` regardless of selected theme. Each theme now also sets `--background` (matching its `slate-950` value) and `--foreground` (matching its text color), so the full page background changes on theme switch.

## 2026-04-09 (nav: settings gear icon in top-right)

**`app/components/nav.tsx`**: Added a dedicated gear icon button in the top-right of the persistent nav bar that links to `/settings`. Previously the username was a link to settings, but it was not visually distinct from plain text, making the settings page undiscoverable.

- Desktop: gear icon (⚙) appears between the username display and the Sign out button; highlights with `bg-slate-800` when on `/settings`
- Mobile: hamburger dropdown now shows a labeled "Settings" link below the username (which is now plain text, no longer a hidden link)

## 2026-04-09 (fix theme hydration mismatch — suppressHydrationWarning)

**`app/layout.tsx`**: Added `suppressHydrationWarning` to the `<html>` element. The FOUC-prevention script runs synchronously before React hydrates and sets `data-theme` on `document.documentElement`. React then sees a mismatch between its server-rendered `<html>` (no `data-theme`) and the live DOM (`data-theme="simple-dark"`), triggering a hydration error. `suppressHydrationWarning` tells React the attribute difference on this element is intentional.

## 2026-04-09 (fix FOUC script placement — hydration errors)

**`app/layout.tsx`**: Wrapped the FOUC-prevention `<script>` in an explicit `<head>` tag. Previously the script was a direct child of `<html>` (between `<html>` and `<body>`), which is invalid HTML. This caused three console errors:
1. *"Cannot render a sync or defer `<script>` outside the main document without knowing its order"* — React couldn't determine where in the document to place an unordered inline script.
2. *"In HTML, `<script>` cannot be a child of `<html>`"* — the browser auto-corrected by moving the script into `<head>`, but that differed from React's server render.
3. *Hydration attribute mismatch* — the DOM correction made the client tree diverge from the SSR output, breaking hydration.

Moving the script inside `<head>` makes the server HTML valid, the browser leaves it in place, and the client hydration matches.

## 2026-04-09 (lint fixes — react-hooks/set-state-in-effect)

**No functional changes — lint errors only:**

- **`app/components/nav.tsx`**: Refactored two `useEffect` hooks to avoid synchronous `setState` calls in the effect body (flagged by `react-hooks/set-state-in-effect`):
  - Menu-close effect now puts `setMenuOpen(false)` in the cleanup return, so it fires on route change without being in the effect body.
  - League-fetch effect removes the early-return `setLeague(null)` from the body; instead, the cleanup function sets `setLeague(null)` and sets an `active` flag to cancel stale fetch callbacks.
- **`app/leagues/[leagueId]/leaderboard/page.tsx`**: Added `// eslint-disable-next-line react-hooks/set-state-in-effect` above `setLoading(true)` — this is an idiomatic loading-state reset before a fetch and cannot be cleanly eliminated without a larger refactor.
- `npm run lint` now exits 0 (no errors; 2 pre-existing unused-variable warnings remain).

## 2026-04-08 (phase 4 task 8 — color themes)

**Visual changes (no schema or API changes):**

- **New file** `lib/theme.tsx`:
  - Exports `ThemeProvider`, `useTheme()`, `THEMES`, `THEME_LABELS`, `THEME_SWATCHES`
  - Stores theme preference in `localStorage` under key `lockhub-theme`
  - Applies theme by setting/removing `data-theme` attribute on `document.documentElement`
  - 6 themes: Slate (default), Nord, Tokyo Night, Monokai, Simple Dark, Simple Light

- **`app/globals.css`**:
  - Added 5 `html[data-theme="X"]` CSS variable override blocks
  - Remaps `--color-slate-*`, `--color-white`, `--color-blue-*`, `--color-green-400`, `--color-red-400` per theme
  - Tailwind 4's utility classes reference these variables at runtime — zero component changes required

- **`app/layout.tsx`**:
  - Added inline FOUC-prevention `<script>` that synchronously reads `localStorage` and sets `data-theme` before first paint

- **`app/providers.tsx`**:
  - `ThemeProvider` wraps `SessionProvider` so all client components can call `useTheme()`

- **`app/settings/page.tsx`**:
  - New "Appearance" section between Display Name and Your Profile
  - 6 swatch cards with mini color preview, theme name, and active checkmark
  - Clicking a swatch instantly re-themes the entire app

## 2026-04-08 (phase 4 task 7 — team logos)

**Visual changes (no schema or API changes):**

- **New file** `lib/team-logos.ts`:
  - Exports `getTeamLogoUrl(sport, teamName): string | null`
  - Maps full team names to ESPN CDN logo URLs (`https://a.espncdn.com/i/teamlogos/...`)
  - Covers all 32 NFL teams, 30 NBA teams, 30 MLB teams, 32 NHL teams, and major NCAAF/NCAAB programs
  - Returns `null` for unknown teams so callers can skip rendering the image

- **Picks page** (`app/leagues/[leagueId]/page.tsx`):
  - Each pick button now shows a 32×32 team logo above the team name when a logo mapping exists
  - Logo rendered via `<Image unoptimized>` fetched directly from ESPN CDN

- **Slate history page** (`app/leagues/[leagueId]/slates/[slateId]/page.tsx`):
  - Added parallel fetch of `/api/leagues/${leagueId}` to get the league's sport for logo lookup
  - Same logo treatment as picks page — logo above team name in each game card

## 2026-04-08 (phase 4 task 4 — mobile layout fixes)

**Visual changes (no schema or API changes):**

- **Leaderboard page** (`app/leagues/[leagueId]/leaderboard/page.tsx`):
  - Reduced cell padding from `px-5` to `px-3 sm:px-5` to prevent horizontal overflow at 375px
  - Hid the "Picked" column on mobile (`hidden sm:table-cell`) to free horizontal space

- **Picks page** (`app/leagues/[leagueId]/page.tsx`):
  - Slate header row changed to `flex-wrap` so the lock deadline drops below the title on narrow screens instead of overflowing

- **Admin page** (`app/leagues/[leagueId]/admin/page.tsx`):
  - Game info row restructured: team matchup on its own line; date/time on a separate line below — prevents overflow on small viewports
  - Score entry row changed to `flex-wrap` so inputs wrap when needed
  - Add-games schedule list: checkbox aligns to top (`items-start`); team matchup and date now on separate lines inside the label

- **League Settings page** (`app/leagues/[leagueId]/settings/page.tsx`):
  - Member row padding reduced to `px-3 sm:px-5`; actions gap tightened to `gap-1 sm:gap-2`
  - Role badge hidden on mobile for non-self members (role is implied by Demote/Promote button text); always shown for the current user row which has no action buttons

## 2026-04-08 (phase 4 tasks 3/5/6 — admin restyle, loading skeletons, empty states)

**Visual changes (no schema or API changes):**

- **Admin page full restyle** (`app/leagues/[leagueId]/admin/page.tsx`):
  - Replaced all `zinc`/light-mode classes with slate dark equivalents
  - Removed `← Back` link (nav bar covers navigation)
  - Widened container from `max-w-2xl` to `max-w-4xl`
  - Primary buttons now use `bg-blue-600 hover:bg-blue-500`
  - Slate cards use `rounded-2xl border-slate-800 bg-slate-900` with animated chevron expand/collapse
  - Score inputs, tiebreaker inputs, and add-games list all styled dark
  - Status badges use colour-coded pills (blue = active, green = completed, slate = upcoming)
  - Empty slates state styled as a proper card with descriptive copy
  - Game list checkboxes use `accent-blue-500` for brand consistency

- **Loading skeletons applied everywhere** (Task 5 complete):
  - All pages replaced `<p className="text-slate-500">Loading...</p>` with `<PageLoader />` from `app/components/skeleton.tsx`
  - Home page league list uses `<SkeletonCard>` while fetching instead of text
  - Pages updated: home, league picks, leaderboard, slate history, admin, league settings, new league, profile, user settings

- **Phase 4 Tasks 3, 5, 6 marked complete** in `docs/phase-4.md`

## 2026-04-07 (phase 3 task 4 — tie-breaker questions)

**Schema changes:**
- Added `TiebreakerQuestion` model: `id`, `slateId`, `question`, `answer?` (nullable Int), `position` (auto-assigned)
- Added `TiebreakerResponse` model: `id`, `userId`, `questionId`, `response` (Int); unique `(userId, questionId)`
- Added `tiebreakerQuestions` relation to `Slate`; `tiebreakerResponses` relation to `User`
- Migration: `20260408022201_add_tiebreaker_models`

**API additions:**
- `GET /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` — member; returns questions ordered by position with `myResponse`; `answer` + full `responses` array included only when slate is `completed`
- `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` — admin; creates a question (`question` text); position auto-assigned as max + 1
- `PATCH /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]` — admin; sets the correct `answer` (integer)
- `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]/responses` — member; upserts numeric response; 400 if past lock deadline (30 min before first game in slate)

**Leaderboard changes (`GET /api/leagues/[leagueId]/leaderboard`):**
- When `?slateId=` is provided and the slate has questions with answers, applies Price Is Right proximity scoring as a secondary sort key: score per question = `1 / (1 + (answer - response))` for under/exact; `0` for over. Scores summed across questions.
- Members who responded at least once rank above those who did not (tertiary key before proximity score).
- Overall leaderboard (no slateId) is unchanged.
- Leaderboard response now includes `tiebreakerScore` and `hasResponded` fields.

**Frontend:**
- Active slate view: tie-breaker section appears below games; numeric inputs per question; Submit/Update button; disabled after lock deadline; pre-populated with existing response
- Completed slate view: tie-breaker section shows correct answer badge, each member's response, over/exact highlighting
- Admin page: expanded slate panel now shows "Tie-breaker Questions" section — add new questions via text input, set correct answer per question via number input

**Tests:** 31 new tests (171 total passing) across 3 new test files + updated leaderboard test

## 2026-04-07 (phase 3 task 3 — user profiles)

**API additions:**
- `GET /api/users/[userId]` — authenticated; 403 unless requester shares a league with the target or is viewing their own profile; returns `id`, `name`, masked `email` (first char + `***@domain`), `createdAt`, per-league `stats` (leagueId, leagueName, sport, correctPicks, totalPicks, accuracy %), and `pickHistory` (last 15 picks with isCorrect flag)
- `PATCH /api/users/me` — authenticated; updates current user's `name`; 400 if name is missing or blank; returns `{ id, name, email }`

**Frontend:**
- `/profile/[userId]` — profile page showing display name, masked email, join date, overall pick stat summary, per-league stats table, and recent pick history with correct/wrong/pending badges; "Edit profile" link shown to the profile owner
- `/settings` — settings page for the current user; form to set/update display name; link to view your own profile
- Leaderboard: player names are now clickable links to `/profile/[userId]`
- Home page: "Settings" link added to the header alongside the sign-out button

**Tests:** 11 new tests (all passing) across 2 test files for `GET /api/users/[userId]` and `PATCH /api/users/me`

## 2026-04-06 (phase 3 task 2 — league settings)

**API additions:**
- `PATCH /api/leagues/[leagueId]` — admin can rename the league (`name`) or change the sport (`sport`); sport change blocked if any slates have been created; validates name is non-empty and sport is in the allowed list
- `GET /api/leagues/[leagueId]/members` — admin-only; returns all members with user details (name, email) ordered by join date
- `PATCH /api/leagues/[leagueId]/members/[userId]` — admin can change a member's role (admin ↔ member); blocked with 400 if demoting the sole admin
- `DELETE /api/leagues/[leagueId]/members/[userId]` — admin can remove a member; blocked with 400 if removing the sole admin

**Frontend:**
- `/leagues/[leagueId]/settings` — league settings page with: rename form, sport selector (locked if slates exist), invite code display with copy button, member table with Promote/Demote and Remove buttons; non-admins are redirected to the league home
- League home page nav now shows a "Settings" link for admins alongside the existing Admin link

**Tests:** 35 new tests (all passing) across 3 test files for the four new/updated API routes

## 2026-04-06 (phase 3 task 1 — bug fixes)

- Admin page: removed position input from "Create Slate" form; position is now auto-assigned as max existing position + 1 so admins never need to think about ordering
- Admin page: added `router.refresh()` after slate creation and after adding games so the league home page does not serve a stale cached view when navigated to
- Admin page: "Add games from schedule" panel now filters out games already present in the slate, preventing duplicates; shows "All scheduled games have already been added" when nothing remains
- Slate history page: back link now goes to the league home page instead of the leaderboard
- League home page: now shows a "Past Slates" section listing completed slates as links to their history pages so users can review results after a slate is scored

## 2026-04-06 (phase 3 task 1 — UI gaps + slate-based lock time)

**API additions and changes:**
- `GET /api/leagues/[leagueId]` — new route; returns league name, sport, inviteCode, memberCount, and current user's role
- `GET /api/sport-games?sport=&season=` — new route; returns master schedule games filtered by sport; optional season param
- `GET /api/leagues/[leagueId]/games` — now includes `myPick` on each game and `lockDeadline` on the slate (30 min before first game startTime)
- `GET /api/leagues/[leagueId]/slates/[slateId]/games` — now includes `myPick` on each game
- `POST /api/leagues/[leagueId]/games/[gameId]/picks` — lock deadline changed from `game.startTime` to 30 minutes before the earliest game startTime in the slate; falls back to `game.startTime` for games with no slate

**Frontend:**
- Home page (`/`) — shows authenticated user's league list with sport badge and member count; Create/Join league actions; join form inline
- League home (`/leagues/[leagueId]`) — shows active slate games with inline pick buttons; highlights current pick; shows correct/incorrect on completed games; shows lock deadline; admin link if role=admin
- Slate history (`/leagues/[leagueId]/slates/[slateId]`) — read-only view of a completed or active slate's games with scores and user's pick results
- Admin page (`/leagues/[leagueId]/admin`) — create slates, expand slate to record game scores, add games from master schedule (browseable checklist)
- Leaderboard (`/leagues/[leagueId]/leaderboard`) — added back link to league home; "View games →" link appears when a slate is selected in the selector

**Tests:** 99 passing (was 81; +18 new tests across 5 test files)

## 2026-04-06 (phase 3 plan revision)

- Revised `docs/phase-3.md` to cover gaps identified in plan review
- Reordered tasks: UI gaps first (foundational usability), then league settings, user profiles, tie-breakers (most complex)
- Defined unified lock time: all picks and tie-breaker responses due 30 minutes before the slate's first game starts; replaces per-game lock; falls back to `game.startTime` for games with no slate
- Added `GET /api/leagues/[leagueId]` to Task 2 (settings page needs single-league detail)
- Added `PATCH /api/users/me` and `/settings` UI to Task 3 (users need a way to set their display name; `User.name` is nullable)
- Specified profile page authorization: 403 unless requester and target share at least one league membership
- Promoted tie-breaker leaderboard integration from stretch goal to required; defined proximity scoring formula (Price Is Right rules; scores summed across questions)
- Added tie-breaker UI to Task 4: response inputs on active slate view, answer reveal on completed slate view
- Removed custom game lists from Phase 3 goals (already deferred in prior commit; cleaned up goal list accordingly)

## 2026-04-04 (phase 3 planning)

- Defined Phase 3 goals and tasks in `docs/phase-3.md`
- Phase 3 covers: tie-breaker questions per slate, user profile pages, league settings (rename + member management), custom game lists, and UI gaps from Phases 1 and 2
- Identified UI gaps: no home-page league list, no games/picks view, no admin slate management UI — all to be addressed in Phase 3
- Schema changes scoped: only `TiebreakerQuestion` and `TiebreakerResponse` models are new; tasks 3–5 require no schema changes
- Updated `docs/roadmap.md`: Phase 2 marked complete, Phase 3 marked in progress

## 2026-04-03 (leaderboard error display fix)

- Leaderboard UI now shows the actual API error message (e.g. "Forbidden", "Slate not found") instead of the generic "Failed to load leaderboard"

## 2026-04-03 (phase 2 task 6 -- per-slate leaderboard)

- `GET /api/leagues/[leagueId]/leaderboard` now accepts optional `?slateId=` query param; validates slate belongs to league (404 if not); filters completed games to that slate; overall behavior unchanged when omitted
- Leaderboard UI updated with a slate selector dropdown (Overall + each slate); active slates labelled "(in progress)"; switching slates re-fetches without reload
- 5 new unit tests for slateId path; 81 total passing
- Phase 2 is now complete

## 2026-04-03 (phase 2 tasks 4 & 5 -- sequential slate release + games API)

- `POST /api/leagues/[leagueId]/slates` now auto-activates the new slate when no active slate exists for the league; otherwise creates as `upcoming`
- `PATCH /api/leagues/[leagueId]/games/[gameId]` — admin records game result (homeScore, awayScore); marks game completed; triggers slate promotion: if all slate games complete, slate → completed and next upcoming slate → active
- `GET /api/leagues/[leagueId]/games` updated to return `{ slate, games }` for the active slate only (breaking change from flat array); returns `{ slate: null, games: [] }` when no active slate
- `GET /api/leagues/[leagueId]/slates/[slateId]/games` added — any member can view games for a specific slate with metadata (for slate history)
- 19 new unit tests; 76 passing total

## 2026-04-03 (phase 2 task 3 -- slate model and game association)

- `GET /api/leagues/[leagueId]/slates` — list slates ordered by position with game count (any member)
- `POST /api/leagues/[leagueId]/slates` — admin creates a slate with name and position; returns 409 on duplicate position
- `POST /api/leagues/[leagueId]/slates/[slateId]/games` — admin adds games to a slate from the SportGame schedule; enforces sport match between league and SportGame; returns created games ordered by startTime
- New slates default to status `upcoming`; only admins can create slates or populate them
- 24 new unit tests across both routes; 57 passing total

## 2026-04-03 (phase 2 task 2 -- master game schedule seed)

- Created `prisma/seed.ts` with 15 sample SportGame rows: NFL 2026 Weeks 1–2 (10 games) and NBA 2026-2027 Opening Week (5 games)
- Configured seed command in `prisma.config.ts` (`migrations.seed: "tsx prisma/seed.ts"`)
- Installed `tsx` as a dev dependency for running the TypeScript seed script
- Seed script is idempotent — clears SportGame rows before inserting, safe to re-run
- Added `npx prisma db seed` to CLAUDE.md commands section
- 33 tests still passing

## 2026-04-03 (phase 2 task 1 -- sport field)

- `POST /api/leagues` now requires `sport`; validates against allowed list (NFL, NBA, MLB, NHL, NCAAF, NCAAB); returns 400 with descriptive error for missing or invalid sport
- `GET /api/leagues` response now includes `sport` on each league (no query change needed — already spread from league object)
- Created `lib/sports.ts` as shared source of truth for the allowed sports list
- Created create-league UI at `/leagues/new` with league name input and sport selector
- Added 7 new unit tests for POST (401, missing name, missing sport, invalid sport, success, sport passed to DB, all valid sports accepted); updated GET fixture data to include `sport`
- 33 tests passing total

## 2026-04-03 (phase 2 schema migrations)

- Applied migration `20260403203730_phase_2_schema`: added `sport` (nullable String) to `League`; added `SportGame` model for app-managed canonical game schedules per sport; added `Slate` model (`leagueId`, `name`, `position`, `status`); added `slateId` (nullable FK) to `Game`
- All changes are additive — no existing data structures removed or renamed
- All 26 existing tests continue to pass

## 2026-04-03 (phase 2 planning)

- Defined Phase 2 goals and tasks in docs/phase-2.md
- Clarified that leagues are single-sport only (no mixed-sport leagues)
- Defined slate release rules: only one slate active per league at a time; next slate not released until current slate is fully complete
- Defined that each sport will have a default master game schedule that leagues draw from; per-league customization is a future Phase 3 enhancement
- Updated product-brief.md and roadmap.md to reflect these requirements

## 2026-04-03

- Added `GET /api/leagues/[leagueId]/leaderboard` route to rank league members by correct picks on completed games (auth guard, membership check, dense ranking, tie-game handling, zero-pick members included); 11 Vitest unit tests covering all guard branches, scoring logic, and edge cases
- Added leaderboard UI page at `app/leagues/[leagueId]/leaderboard/page.tsx` (client component, ranked table with current-user highlight, empty state, loading/error states)

## 2026-03-20

- Added `POST /api/leagues/[leagueId]/games/[gameId]/picks` route to submit or update a pick for a game (auth guard, membership check, body validation, game existence + league ownership check, deadline guard, upsert by `(userId, gameId)`); 8 Vitest unit tests covering all guard branches and happy path

- Added `GET /api/leagues/[leagueId]/games` route to list upcoming games within a league (auth guard, membership check, filters to scheduled games with future start times)
- Added `GET /api/leagues` route to list all leagues the current user belongs to (returns role and member count per league)
- Set up vitest for unit testing; added tests for `GET /api/leagues` (401, empty list, populated list)
- Added `POST /api/leagues/join` route to join a league via invite code (auth guard, invite code lookup, duplicate membership check)
- Added `POST /api/leagues` route to create a league (auth guard, name validation, Prisma transaction to create league + admin membership)

## 2026-03-19

- Project initialized with Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- Prisma 7 configured with PostgreSQL (Neon) as the database
- NextAuth v4 selected for authentication
- Created initial documentation in `/docs`
- Designed initial database schema: User, Account, Session, VerificationToken, League, LeagueMember, Game, Pick
- Applied initial database migration (`init`)
- Set up NextAuth with GitHub OAuth provider, Prisma adapter, and database sessions
- Added SessionProvider, login page, home page with session state, and server-side auth helpers
- Fixed Prisma 7 client import path (`client.ts` entrypoint)
- Rebranded app from PickemApp to LockHub
- Switched authentication from GitHub OAuth to email magic-link sign-in
- Added `/login/verify` confirmation page for magic-link flow
- Added `nodemailer` dependency required by NextAuth email provider
