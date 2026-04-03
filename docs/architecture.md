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

- `app/api/leagues/` -- REST API routes (leagues, games, picks, leaderboard)
- `app/leagues/` -- UI pages for league features (e.g. leaderboard)
- `lib/` -- shared utilities, database client, auth config
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
- **League** -- a pick'em competition group created by a user
- **LeagueMember** -- join table linking users to leagues with a role (admin/member)
- **Game** -- a matchup within a league (home vs. away, start time, scores, status)
- **Pick** -- a user's prediction for a game (one per user per game)
