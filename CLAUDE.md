# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Requirements

After making any code changes, update the relevant files in `docs/` to reflect those changes — including `changelog.md` (add an entry describing what changed and why) and any of `architecture.md`, `product-brief.md`, or `roadmap.md` that are affected.

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
| `GET /api/leagues/[leagueId]/games` | member | Active slate games; returns `{ slate, games }` — slate includes `lockDeadline`; each game includes `myPick`; `slate` is null if no active slate |
| `PATCH /api/leagues/[leagueId]/games/[gameId]` | admin | Record game result (`homeScore`, `awayScore`); triggers slate promotion if all slate games complete |
| `POST /api/leagues/[leagueId]/games/[gameId]/picks` | member | Upsert pick; blocked 30 min before earliest game startTime in the slate (falls back to `game.startTime` for games with no slate) |
| `GET /api/leagues/[leagueId]/slates` | member | List slates ordered by position with game count |
| `GET /api/leagues/[leagueId]/slates/[slateId]/games` | member | Games for a specific slate with slate metadata; each game includes `myPick`; for historical view |
| `POST /api/leagues/[leagueId]/slates` | admin | Create a slate (`name`, `position`) |
| `POST /api/leagues/[leagueId]/slates/[slateId]/games` | admin | Populate slate with games from SportGame schedule (`sportGameIds[]`); enforces sport match |
| `GET /api/leagues/[leagueId]/leaderboard` | member | Ranked members by correct picks; optional `?slateId=` to scope to a single slate |
| `GET /api/sport-games` | required | Master schedule games; requires `?sport=`; optional `?season=` |

### Data model (core)
- **User** — email-based identity
- **League** — group with a unique invite code (CUID); `sport` field (NFL/NBA/MLB/NHL/NCAAF/NCAAB)
- **LeagueMember** — join table with `role: admin | member`
- **SportGame** — app-managed master schedule per sport (`homeTeam`, `awayTeam`, `scheduledAt`, `season`); seeded via `prisma/seed.ts`
- **Slate** — named round within a league (`name`, `position`, `status: upcoming|active|completed`); only one active at a time; first slate auto-activates, subsequent slates activate when previous is fully scored
- **Game** — matchup within a slate (`slateId` FK, `startTime`, `status`, nullable scores); created from `SportGame` rows by league admins
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
```

### Prisma notes
- Client is generated to `lib/generated/prisma/` (configured in `prisma.config.ts`)
- Use the singleton from `lib/db.ts` — never instantiate `PrismaClient` elsewhere
- Run `prisma generate` after any schema change before running code or tests
- `@prisma/adapter-pg` handles connection pooling; the adapter wraps a `pg.Pool`
- Seed command configured in `prisma.config.ts` (`migrations.seed`); uses `tsx` to run TypeScript directly
- `lib/sports.ts` is the single source of truth for the allowed sports list — import `SPORTS` from there in both API routes and UI

### Phase status
- **Phase 1 (MVP):** Complete — auth, leagues, games, picks, leaderboard
- **Phase 2 (Slates & Sports):** Complete — sport field, master schedule, slates, sequential release, per-slate leaderboard
- **Phase 3 (League Management):** Not started — see `docs/roadmap.md`
