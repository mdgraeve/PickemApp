# Architecture

## Tech Stack

| Layer          | Technology                        |
| -------------- | --------------------------------- |
| Framework      | Next.js 16 (App Router)           |
| Language       | TypeScript                        |
| Database       | PostgreSQL (Neon)                  |
| ORM            | Prisma 7                          |
| Authentication | NextAuth v4 + @auth/prisma-adapter + nodemailer |
| Styling        | Tailwind CSS 4                    |

## Next.js Structure

The app uses Next.js App Router with the `app/` directory at the project root. Server Components are the default; Client Components are opted into with `"use client"` where interactivity is needed.

Key directories:

- `app/api/leagues/` -- REST API routes (leagues, games, picks, leaderboard, slates)
- `app/api/sport-games/` -- master schedule query endpoint
- `app/api/admin/` -- app-level admin routes (schedule sync); gated by `APP_ADMIN_EMAILS` env var
- `app/api/cron/` -- cron job endpoints (score sync); gated by `x-cron-secret` header
- `app/api/users/` -- user profile and settings routes (`GET /[userId]`, `PATCH /me`)
- `app/api/leagues/[leagueId]/slates/[slateId]/tiebreakers/` -- tie-breaker question CRUD and response submission
- `app/leagues/` -- UI pages for league features (home, games/picks, leaderboard, slate history, admin)
- `app/admin/` -- app-level admin page (`/admin`); accessible to emails listed in `APP_ADMIN_EMAILS`
- `app/profile/` -- user profile page (`/profile/[userId]`)
- `app/settings/` -- current user settings page
- `lib/` -- shared utilities, database client, auth config, ESPN API client
- `prisma/` -- schema and migrations
- `public/` -- static assets
- `docs/` -- project documentation (this folder)

## Prisma + PostgreSQL Setup

- Schema defined in `prisma/schema.prisma`
- Prisma config in `prisma.config.ts` (loads `DATABASE_URL` from `.env`)
- Generated client output: `lib/generated/prisma`
- Singleton client instance exported from `lib/db.ts`

## Authentication

NextAuth v4 with the Prisma adapter. Sessions are stored in the database via the Account, Session, and VerificationToken models.

- Auth options defined in `lib/auth.ts` (shared between route handler and server-side helpers)
- Route handler at `app/api/auth/[...nextauth]/route.ts`
- Session type augmented in `lib/auth-types.d.ts` to expose `user.id`
- Email magic-link sign-in via SMTP (no passwords, no OAuth)
- SMTP delivery uses `nodemailer`; requires `EMAIL_SERVER_*` and `EMAIL_FROM` env vars
- Custom sign-in page at `/login`, verification page at `/login/verify`

## Data Model Overview

- **User** -- authenticated user; has accounts, sessions, league memberships, and picks
- **Account / Session / VerificationToken** -- NextAuth adapter models for auth state
- **League** -- a pick'em competition group; tied to a single sport; optional `description`, `maxMembers` (null = unlimited), and `isPrivate` flag (default true); can be permanently deleted by an admin (cascades to all child records)
- **LeagueMember** -- join table linking users to leagues with a role (admin/member)
- **SportGame** -- app-managed canonical schedule per sport; seeded via `prisma/seed.ts`
- **Slate** -- named round within a league (position, status: upcoming/active/completed); one active at a time
- **Game** -- a matchup within a slate (home vs. away, start time, scores, status)
- **Pick** -- a user's prediction for a game (one per user per game); locked 30 min before first game in slate

## ESPN API Client

`lib/espn.ts` is the single boundary between the app and ESPN's public (undocumented) scoreboard API. All ESPN HTTP calls go through this module — nothing ESPN-related is fetched elsewhere. Route handlers receive clean `ESPNGame[]` objects; they never touch raw ESPN JSON.

This design means:
- Migrating to a paid data provider only requires changing `lib/espn.ts`
- Route tests mock `lib/espn.ts` with `vi.mock()` and fixture JSON — no real HTTP calls in tests

## App-level admin

"App admin" (who can trigger schedule syncs) is separate from "league admin" (who can manage a specific league). App-level admin is gated by the `APP_ADMIN_EMAILS` environment variable (comma-separated email list) checked server-side against `session.user.email`. There is no `isAppAdmin` flag on the `User` model — this is an operational concern, not a user-facing feature.

## Cron jobs

Background score-sync runs via Vercel Cron, which calls `POST /api/cron/sync-scores` on a schedule. The endpoint is authenticated with an `x-cron-secret` header (checked against the `CRON_SECRET` env var). The endpoint is idempotent — safe to call multiple times; it always returns `200` even when there is nothing to update, to prevent Vercel retry loops.
