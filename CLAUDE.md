# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Requirements

After making any code changes, update the relevant files in `docs/` to reflect those changes — including `changelog.md` (add an entry describing what changed and why) and any of `architecture.md`, `product-brief.md`, or `roadmap.md` that are affected.

## Sensitive operations policy

This project is moving toward a real production deployment serving real users (friends), so a set of operations are off-limits for Claude to perform directly — even when technically possible. `.claude/settings.json` enforces the hard cases below with `deny` rules that hold regardless of what any local `settings.local.json` allows. Don't try to work around a denial (e.g. by rewriting the command differently, or writing the secret to a different file) — treat a denial as a hard boundary and follow the handoff behavior below.

**What's sensitive:**
1. **Real secret values** — never read, print, or write actual values into `.env`, `.env.production`, `.env.local`, `.env.sentry-build-plugin`, or `.mcp.json`. Discussing variable *names*, or editing a `.env.example`-style template with placeholder values, is fine and not restricted.
2. **Production database writes** — `prisma migrate deploy`, `prisma db push`, `prisma db execute`, or any raw SQL intended for the production database. Local/dev Prisma commands (`migrate dev`, `generate`, `studio`, `db seed`) are unrestricted.
3. **Pushing to `main`** — once Vercel is connected to this repo, a push to `main` triggers a production deploy. Pushes to feature branches are fine.
4. **Vercel production actions** — plan/billing changes, production environment variables, domain configuration (`vercel env`, `vercel --prod`, `vercel deploy --prod`, `vercel domains`, `vercel project`).
5. **Namecheap DNS records and account settings.**
6. **Resend domain verification / API key management.**
7. **Sentry account or project creation, DSN retrieval.**
8. **Any purchase or billing action**, on any service.

**How to handle it when a task touches one of these:**
- **Mode A (work around it):** If the rest of the task doesn't actually depend on the sensitive step, do everything else and hand off just that piece — give exact values/commands/dashboard locations for the user to execute themselves, then treat the task as done pending that manual step.
- **Mode B (stop and resume):** If the sensitive step is a hard blocking dependency (nothing further can be verified or built without it), stop there, explain exactly what's needed and why, give precise step-by-step instructions, and wait for the user to confirm it's done before resuming the rest of the task.

Either way: be explicit about *which* mode applies and *why*, don't guess at values on the user's behalf, and don't ask the user to paste secret values back into the chat — point them to where to enter them directly (Vercel dashboard, Resend dashboard, etc.).

## Commands

```bash
npm run dev        # Start development server (Next.js)
npm run build      # Production build
npm run lint       # Run ESLint
npm run test       # Run all tests once (Vitest)
npx vitest run path/to/test.ts   # Run a single test file

npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma generate                    # Regenerate Prisma client after schema changes
npx prisma db seed                     # Seed master game schedule (SportGame table)
npx prisma studio                      # Open Prisma Studio (DB browser)
```

## Architecture

**LockHub** is a sports pick'em web app built on Next.js 16 App Router with TypeScript. Users create/join leagues, view scheduled games, and submit picks.

### Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL (Neon cloud) via Prisma 7 + `@prisma/adapter-pg`
- **Auth:** NextAuth v4 — email magic-link only (no passwords, no OAuth), SMTP via Resend/nodemailer
- **Testing:** Vitest 4 (globals enabled, no imports needed for `describe`/`it`/`expect`)

### Key directories
- `app/api/` — REST API routes (all JSON, Next.js route handlers)
- `app/leagues/` — UI pages for league features (leaderboard, create league)
- `app/login/` — Auth pages (sign-in, verify)
- `lib/` — Shared utilities: `db.ts` (Prisma singleton), `auth.ts` (NextAuth config), `session.ts` (auth helpers), `sports.ts` (allowed sports list)
- `prisma/schema.prisma` — Source of truth for the data model
- `prisma/seed.ts` — Seeds `SportGame` master schedule (run with `npx prisma db seed`)
- `lib/generated/prisma/` — Auto-generated Prisma client (do not edit manually)
- `docs/` — Architecture, changelog, product brief, roadmap, phase-2 plan

### API structure
All protected routes guard with `getSession()` / `requireSession()` from `lib/session.ts`. League-scoped routes verify `leagueMember` membership before returning data.

| Route | Auth | Notes |
|---|---|---|
| `POST /api/leagues` | required | Create league; requires `name` and `sport` (NFL/NBA/MLB/NHL/NCAAF/NCAAB); creator gets `admin` role |
| `GET /api/leagues` | required | List leagues the current user belongs to |
| `POST /api/leagues/join` | required | Join via invite code |
| `GET /api/leagues/[leagueId]` | member | League details (`id`, `name`, `sport`, `inviteCode`, `memberCount`, `role`) |
| `PATCH /api/leagues/[leagueId]` | admin | Update `name` and/or `sport`; sport change blocked once any slates exist |
| `DELETE /api/leagues/[leagueId]` | admin | Permanently delete the league and all related data (slates, games, picks, tiebreakers) via cascade |
| `GET /api/leagues/[leagueId]/members` | admin | List all members with user details (name, email) ordered by joinedAt |
| `PATCH /api/leagues/[leagueId]/members/[userId]` | admin | Change member role (admin ↔ member); 400 if demoting sole admin |
| `DELETE /api/leagues/[leagueId]/members/[userId]` | admin | Remove member; 400 if removing sole admin |
| `GET /api/leagues/[leagueId]/games` | member | Active slate games; returns `{ slate, games }` — slate includes `lockDeadline`; each game includes `myPick`; `slate` is null if no active slate |
| `GET /api/leagues/[leagueId]/games/live` | member | Live score overlay for in-progress games; returns `{ [gameId]: { homeScore, awayScore, clock, period, shortDetail, status } }` keyed by internal game ID; `{}` when no active slate, no espnGameIds, or ESPN unreachable |
| `PATCH /api/leagues/[leagueId]/games/[gameId]` | admin | Record game result (`homeScore`, `awayScore`); triggers slate promotion if all slate games complete |
| `POST /api/leagues/[leagueId]/games/[gameId]/picks` | member | Upsert pick; blocked 30 min before earliest game startTime in the slate (falls back to `game.startTime` for games with no slate) |
| `GET /api/leagues/[leagueId]/slates` | member | List slates ordered by position with game count |
| `GET /api/leagues/[leagueId]/slates/[slateId]/games` | member | Games for a specific slate with slate metadata; each game includes `myPick`; slate object includes `lockDeadline` (30 min before earliest game, or null); works for all slate statuses |
| `POST /api/leagues/[leagueId]/slates` | admin | Create a slate (`name`, `position`) |
| `POST /api/leagues/[leagueId]/slates/[slateId]/games` | admin | Populate slate with games from SportGame schedule (`sportGameIds[]`); enforces sport match |
| `GET /api/leagues/[leagueId]/leaderboard` | member | Ranked members by correct picks; optional `?slateId=` to scope to a single slate |
| `GET /api/sport-games` | required | Master schedule games; requires `?sport=`; optional `?season=` or `?date=YYYYMMDD` (24-hour UTC window) |
| `POST /api/leagues/[leagueId]/slates/[slateId]/sync-espn` | league admin | Sync ESPN games for a date into SportGame; accepts `{ date: "YYYYMMDD" }`; reads league sport; returns `{ inserted, updated }` |
| `POST /api/admin/sync-schedule` | session + `APP_ADMIN_EMAILS` | App-level bulk ESPN sync; accepts `{ sport, date: "YYYYMMDD" }`; returns `{ inserted, updated }` |
| `POST /api/cron/sync-scores` | `x-cron-secret` header | Cron: discover active-slate sports, poll ESPN, write scores, trigger slate promotion |

### Data model (core)
- **User** — email-based identity
- **League** — group with a unique invite code (CUID); `sport` field (NFL/NBA/MLB/NHL/NCAAF/NCAAB)
- **LeagueMember** — join table with `role: admin | member`
- **SportGame** — app-managed master schedule per sport (`homeTeam`, `awayTeam`, `scheduledAt`, `season`, `espnId`); seeded via `prisma/seed.ts` or synced via `/api/admin/sync-schedule`
- **Slate** — named round within a league (`name`, `position`, `status: upcoming|active|completed`); only one active at a time; first slate auto-activates, subsequent slates activate when previous is fully scored
- **Game** — matchup within a slate (`slateId` FK, `startTime`, `status`, nullable scores, `espnGameId`); created from `SportGame` rows by league admins; `espnGameId` is used by the score-sync cron to match ESPN results
- **Pick** — `(userId, gameId)` unique; records `pickedTeam`; locked 30 min before earliest game startTime in the slate (falls back to `game.startTime` for games with no slate)

NextAuth adapter models (`Account`, `Session`, `VerificationToken`) are managed automatically.

### Environment variables
Required in `.env` (never committed):
```
DATABASE_URL         # Neon PostgreSQL connection string
NEXTAUTH_URL         # http://localhost:3000 in dev
NEXTAUTH_SECRET      # Session signing key
EMAIL_SERVER_HOST    # smtp.resend.com
EMAIL_SERVER_PORT    # 465
EMAIL_SERVER_USER    # resend
EMAIL_SERVER_PASSWORD
EMAIL_FROM
APP_ADMIN_EMAILS     # Comma-separated emails allowed to call /api/admin/sync-schedule
CRON_SECRET          # Shared secret for authenticating /api/cron/sync-scores (x-cron-secret header)
```

### Prisma notes
- Client is generated to `lib/generated/prisma/` (configured in `prisma.config.ts`)
- Use the singleton from `lib/db.ts` — never instantiate `PrismaClient` elsewhere
- Run `prisma generate` after any schema change before running code or tests
- `@prisma/adapter-pg` handles connection pooling; the adapter wraps a `pg.Pool`
- Seed command configured in `prisma.config.ts` (`migrations.seed`); uses `tsx` to run TypeScript directly
- `lib/sports.ts` is the single source of truth for the allowed sports list — import `SPORTS` from there in both API routes and UI

### Key libraries
- `lib/espn.ts` — ESPN API client; the only place ESPN HTTP calls are made; exports `fetchESPNSchedule` and `fetchESPNScoreboard`; mock this module in tests with `vi.mock('@/lib/espn')`

### Phase status
- **Phase 1 (MVP):** Complete — auth, leagues, games, picks, leaderboard
- **Phase 2 (Slates & Sports):** Complete — sport field, master schedule, slates, sequential release, per-slate leaderboard
- **Phase 3 (League Management):** Complete — tiebreakers, user profiles, league settings, member management
- **Phase 4 (UI Polish):** Complete — dark design system, nav, skeletons, empty states, team logos, color themes, homepage hero, pixel art podium
- **Phase 5 (Sports Data Integration):** Complete — ESPN client, ESPN ID fields, schedule import (league admin + app admin), score auto-sync cron
