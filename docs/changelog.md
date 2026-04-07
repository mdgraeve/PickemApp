# Changelog

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
