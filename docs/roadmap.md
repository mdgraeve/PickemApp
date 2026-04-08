# Roadmap

## Phase 1 -- MVP (complete)

- User authentication (NextAuth, email magic-link)
- Create and join leagues with invite codes
- View games within a league
- Submit picks (one per user per game, locked at game start)
- Leaderboard showing correct pick counts per league

## Phase 2 -- Slates & Sports (complete)

See [phase-2.md](phase-2.md) for full goals, tasks, and current status.

- **Sport field on leagues** -- each league is tied to a single sport; no mixed-sport leagues
- **Master game schedule per sport** -- app-managed canonical schedule that leagues draw from
- **Slates** -- games grouped into named rounds/weeks, one active at a time
- **Sequential slate release** -- next slate unlocks automatically when the current slate is fully scored
- **Per-slate leaderboard** -- results per slate in addition to overall standings

## Phase 3 -- League Management (complete)

See [phase-3.md](phase-3.md) for full goals, tasks, and current status.

- Tie-breaker questions per slate
- User profile pages
- League settings (rename league, manage members)
- UI gaps from Phases 1 and 2 (games view, picks UI, admin slate management, home-page league list)

## Phase 4 -- UI Polish (in progress)

See [phase-4.md](phase-4.md) for full goals, tasks, and current status.

- **Dark design system** — slate-950 base, blue-600 accent; replaces zinc/light-mode palette
- **Persistent navigation bar** — sticky top bar with league tabs and user menu; mobile hamburger
- **Visual polish** — improved typography, game cards, pick buttons, wider `max-w-4xl` layout on all pages
- **Mobile layout** — 375px audit; fix overflow, tap targets, admin panel
- **Loading skeletons** — animated shaped placeholders replacing "Loading..." text
- **Empty states** — actionable copy and CTAs replacing bare empty messages
- **Team logos** — ESPN CDN logos on game cards (NFL, NBA, MLB, NHL, NCAAF, NCAAB)

## Phase 5 -- Sports Data Integration

See [phase-5.md](phase-5.md) for full goals, tasks, and current status.

- Automatic schedule import from ESPN API (replaces manual seed script)
- Automatic score sync via cron job (eliminates manual result entry)
- ESPN game ID stored on SportGame for reliable score matching
