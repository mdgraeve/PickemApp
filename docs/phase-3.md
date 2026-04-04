# Phase 3 -- League Management

**Status: In progress**

Phase 3 introduces league administration and personalization. By the end of this phase, admins can manage their leagues (rename, manage members), users have profile pages with pick history, each slate can have tie-breaker questions, and league admins can define custom game lists instead of relying solely on the master SportGame schedule. Phase 3 also fills UI gaps left by Phases 1 and 2, where several backend features were built without corresponding UI pages.

---

## Goals

By the end of Phase 3, the app will be able to:

1. **Support tie-breaker questions per slate** -- admins add numeric tie-breaker questions to a slate; members submit answers before the slate closes; admins record the correct answer; proximity to the answer breaks ties on the leaderboard.

2. **Show user profile pages** -- each user has a profile page visible to members of shared leagues, showing pick history, overall correct-pick rate, and per-sport stats.

3. **Provide league settings** -- admins can rename a league, view all members with their roles, change a member's role, or remove a member.

4. **Support custom game lists** -- admins can add games directly to a slate (custom home/away teams + start time) without requiring a matching `SportGame` entry in the master schedule.

5. **Fill UI gaps from Phases 1 and 2** -- build the missing game view, picks submission UI, admin slate management UI, and a home-page league list that Phase 1/2 shipped as API-only.

---

## Tasks

### 1. Tie-breaker questions

**Status: Not started**

A slate can have one or more tie-breaker questions. Each question is numeric (e.g. "Total combined score in Game 3?"). Members submit a response before the slate's last game starts. After the slate completes, the admin sets the correct answer. Proximity determines tie-breaking order (Price Is Right rules: closest without going over wins; if all go over, closest wins).

**Design intent (long-term):** The tie-breaker question should correspond to the highest-quality game in the slate — the marquee matchup (prime-time game, playoff game, rivalry, etc.). Eventually the system should auto-suggest or auto-link the tie-breaker to that game so the question and lock time are derived automatically. For Phase 3, admins create the question manually with no game association; the game link is future work.

**Schema changes:**

- Add `TiebreakerQuestion` model (`slateId`, `question`, `answer?`, `position`)
- Add `TiebreakerResponse` model (`userId`, `questionId`, `response`)
- Add `tiebreakerQuestions TiebreakerQuestion[]` relation to `Slate`
- Add `tiebreakerResponses TiebreakerResponse[]` relation to `User`

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `GET /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` | member | List questions; `answer` hidden until slate is completed |
| `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` | admin | Create a question (`question`, `position`) |
| `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]/responses` | member | Submit/update numeric response; locked when slate is no longer active |
| `PATCH /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]` | admin | Set correct `answer` |

**Leaderboard impact (stretch goal):** When two members have identical correct pick counts, use their tie-breaker proximity score as a secondary sort key.

---

### 2. User profile pages

**Status: Not started**

Any authenticated user who shares a league with the target user can view their profile. The profile shows aggregate pick stats across all leagues, not just one.

**Schema changes:** None.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `GET /api/users/[userId]` | authenticated | Returns `name`, `email` (masked), `createdAt`, per-league stats (correct/total picks, per sport) |

**UI changes:**

- `/profile/[userId]` — profile page; shows display name, join date, stats table (league, sport, correct picks, total picks, accuracy %), recent pick history

---

### 3. League settings

**Status: Not started**

Only admins can access the settings page. The last admin of a league cannot demote themselves or be removed.

**Schema changes:** None.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `PATCH /api/leagues/[leagueId]` | admin | Update `name`; optionally update `sport` if no slates exist yet |
| `GET /api/leagues/[leagueId]/members` | admin | List all members with `role`, `joinedAt`, `user.email`, `user.name` |
| `PATCH /api/leagues/[leagueId]/members/[userId]` | admin | Change role (`admin` ↔ `member`); 400 if demoting sole admin |
| `DELETE /api/leagues/[leagueId]/members/[userId]` | admin | Remove member; 400 if removing sole admin |

**UI changes:**

- `/leagues/[leagueId]/settings` — settings page with:
  - League rename form
  - Member table (name, role, joined date) with role-change and remove actions (admin only)

---

### 4. Custom game lists

**Status: Not started**

Currently `POST /api/leagues/[leagueId]/slates/[slateId]/games` requires `sportGameIds[]` from the master schedule. Admins need the ability to add ad-hoc matchups (e.g. for playoff brackets or unsupported leagues not yet in the seed data).

**Schema changes:** None — `Game` already has no `SportGame` FK. The model supports custom games today; only the API needs to be extended.

**API changes:**

- `POST /api/leagues/[leagueId]/slates/[slateId]/games` — extend request body to accept either:
  - `{ sportGameIds: string[] }` — existing behavior (draw from master schedule)
  - `{ customGames: { homeTeam: string; awayTeam: string; startTime: string }[] }` — new: create games directly without a SportGame source
- Both modes can be mixed in a single request (union of both arrays)
- Sport-match validation skipped for custom games (no SportGame to check against)

---

### 5. UI gaps from Phases 1 and 2

**Status: Not started**

Several backend features were shipped in Phase 1 and 2 without a corresponding UI. These should be built in Phase 3 before the app is considered usable end-to-end.

| Gap | What to build |
|---|---|
| Home page league list | `/` — show the current user's leagues with sport badge, member count, and link to the league |
| League home / active slate view | `/leagues/[leagueId]` — show the active slate's games with the user's picks overlaid; submit/change picks inline |
| Pick submission UI | Inline pick buttons on the games view; disabled after game start time |
| Slate history | Link from the leaderboard to view completed slate games and results |
| Admin: slate management | Admin-only section in the league to create slates, add games from the master schedule (or custom), and record game scores |
| Admin: result entry | Form to enter `homeScore` / `awayScore` for each completed game in the active slate |

**No schema or API changes needed** — all of this functionality is already backed by existing routes.

---

## Schema changes required

| Change | Model | Details | Status |
|---|---|---|---|
| Add `TiebreakerQuestion` | new model | `slateId`, `question`, `answer?`, `position` | Not started |
| Add `TiebreakerResponse` | new model | `userId`, `questionId`, `response`; unique `(userId, questionId)` | Not started |
| Add relation | `Slate` | `tiebreakerQuestions TiebreakerQuestion[]` | Not started |
| Add relation | `User` | `tiebreakerResponses TiebreakerResponse[]` | Not started |

Tasks 3 (league settings), 4 (custom game lists), and 5 (UI gaps) require no schema changes.

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| Tie-breaker questions | No | Schema and API not yet built |
| User profiles | No | No profile API or UI |
| League rename | No | No `PATCH /api/leagues/[leagueId]` route |
| Member list / role management | No | No `/members` routes |
| Member removal | No | No `DELETE /members/[userId]` route |
| Custom game lists | No | Slate games API only accepts `sportGameIds[]` |
| Home page league list | No | `/` has no league list; no navigation to leagues |
| League home / games view | No | No `/leagues/[leagueId]` page; API-only |
| Pick submission UI | No | `POST /picks` API exists; no UI |
| Admin slate management UI | No | All slate/game/score APIs exist; no UI |
