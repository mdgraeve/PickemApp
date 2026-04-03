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
- `app/(pages)/` — UI pages: `/login`, `/login/verify`, `/` (dashboard)
- `lib/` — Shared utilities: `db.ts` (Prisma singleton), `auth.ts` (NextAuth config), `session.ts` (auth helpers)
- `prisma/schema.prisma` — Source of truth for the data model
- `lib/generated/prisma/` — Auto-generated Prisma client (do not edit manually)
- `docs/` — Architecture, changelog, product brief, roadmap

### API structure
All protected routes guard with `getSession()` / `requireSession()` from `lib/session.ts`. League-scoped routes verify `leagueMember` membership before returning data.

| Route | Auth | Notes |
|---|---|---|
| `POST /api/leagues` | required | Create league; requires `name` and `sport` (NFL/NBA/MLB/NHL/NCAAF/NCAAB); creator gets `admin` role |
| `GET /api/leagues` | required | List leagues the current user belongs to |
| `POST /api/leagues/join` | required | Join via invite code |
| `GET /api/leagues/[leagueId]/games` | member | Upcoming scheduled games |
| `POST /api/leagues/[leagueId]/games/[gameId]/picks` | member | Upsert pick; blocked after game start time |
| `GET /api/leagues/[leagueId]/leaderboard` | member | Ranked members by correct picks on completed games |

### Data model (core)
- **User** — email-based identity
- **League** — group with a unique invite code (CUID)
- **LeagueMember** — join table with `role: admin | member`
- **Game** — matchup with `startTime`, `status` (`scheduled` | `completed`), nullable scores
- **Pick** — `(userId, gameId)` unique; records `pickedTeam`

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
