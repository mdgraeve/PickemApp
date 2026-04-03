# Roadmap

## Phase 1 -- MVP (complete)

- User authentication (NextAuth, email magic-link)
- Create and join leagues with invite codes
- View games within a league
- Submit picks (one per user per game, locked at game start)
- Leaderboard showing correct pick counts per league

## Phase 2 -- Slates & Sports (in progress)

See [phase-2.md](phase-2.md) for full goals, tasks, and current status.

- **Sport field on leagues** -- each league is tied to a single sport; no mixed-sport leagues
- **Master game schedule per sport** -- app-managed canonical schedule that leagues draw from
- **Slates** -- games grouped into named rounds/weeks, one active at a time
- **Sequential slate release** -- next slate unlocks automatically when the current slate is fully scored
- **Per-slate leaderboard** -- results per slate in addition to overall standings

## Phase 3 -- League Management

- Tie-breaker questions per slate
- User profile pages
- League settings (rename league, manage members)
- Custom game lists -- admins can override the default sport schedule for their league

## Phase 4 -- Monetization

- Paid / premium leagues
- Premium features (detailed stats, pick history export)
- Ad-supported free tier
