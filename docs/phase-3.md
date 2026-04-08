# Phase 3 -- League Management

**Status: In progress**

Phase 3 introduces league administration and personalization. By the end of this phase, the app is usable end-to-end: UI gaps from Phases 1 and 2 are filled, admins can manage their leagues (rename, manage members), users have profile pages with pick history, and each slate supports numeric tie-breaker questions whose answers factor into leaderboard tie-breaking.

---

## Goals

By the end of Phase 3, the app will be able to:

1. **Fill UI gaps from Phases 1 and 2** — build the missing home-page league list, games view, picks submission UI, admin slate management UI, and admin result entry that Phase 1/2 shipped as API-only.

2. **Provide league settings** — admins can rename a league, view all members with their roles, change a member's role, or remove a member.

3. **Show user profile pages** — each user has a profile page visible to members of shared leagues, showing pick history, overall correct-pick rate, and per-sport stats. Users can update their display name.

4. **Support tie-breaker questions per slate** — admins add numeric tie-breaker questions to a slate; members submit answers before the deadline; admins record the correct answer; proximity to the answer breaks ties on the leaderboard.

---

## Pick and tie-breaker lock time

All picks and tie-breaker responses for a slate are due **30 minutes before the slate's first game starts** — i.e., `min(game.startTime) across slate games - 30 minutes`. This replaces the Phase 1/2 behavior where each game locked picks individually at its own `startTime`. The lock deadline is derived at runtime from the slate's games; no new field is stored on the schema.

For games not associated with a slate (legacy data only), the original per-game `startTime` lock behavior is preserved as a fallback.

---

## Tasks

### 1. UI gaps from Phases 1 and 2

**Status: Complete**

Several backend features shipped in Phases 1 and 2 without a corresponding UI. These are built first so the app works end-to-end before new features are layered on. This task also updates the pick lock time on the backend to the new slate-based rule.

| Gap | What to build |
|---|---|
| Home page league list | `/` — show the current user's leagues with sport badge, member count, and a link into the league |
| League home / active slate view | `/leagues/[leagueId]` — show the active slate's games with the user's picks overlaid; submit/change picks inline |
| Pick submission UI | Inline pick buttons on the games view; disabled after the slate lock deadline |
| Slate history | Link from the leaderboard to view completed slate games and results |
| Admin: slate management | Admin-only section to create slates and add games from the master schedule |
| Admin: result entry | Form to enter `homeScore` / `awayScore` for each completed game in the active slate |

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `POST /api/leagues/[leagueId]/games/[gameId]/picks` | member | Lock logic updated: blocked when `now >= min(game.startTime in slate) - 30 minutes`; falls back to `game.startTime` for games with no slate |

No other schema or API changes are needed — all remaining functionality is backed by existing routes.

---

### 2. League settings

**Status: Complete**

Only admins can access the settings page. The last admin of a league cannot demote themselves or be removed.

**Schema changes:** None.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `GET /api/leagues/[leagueId]` | member | Return league details (`id`, `name`, `sport`, `inviteCode`, `createdAt`); used by the settings page and league home |
| `PATCH /api/leagues/[leagueId]` | admin | Update `name`; optionally update `sport` if no slates exist yet |
| `GET /api/leagues/[leagueId]/members` | admin | List all members with `role`, `joinedAt`, `user.email`, `user.name` |
| `PATCH /api/leagues/[leagueId]/members/[userId]` | admin | Change role (`admin` ↔ `member`); 400 if demoting sole admin |
| `DELETE /api/leagues/[leagueId]/members/[userId]` | admin | Remove member; 400 if removing sole admin |

**UI changes:**

- `/leagues/[leagueId]/settings` — settings page with:
  - League rename form (pre-populated from `GET /api/leagues/[leagueId]`)
  - Member table (name, role, joined date) with role-change and remove actions (admin only)

---

### 3. User profiles

**Status: Complete**

Any authenticated user who shares at least one league with the target user can view their profile. The authorization check queries whether the requesting user and the target share a `LeagueMember` record in any common league; returns 403 otherwise. The profile shows aggregate pick stats across all leagues, not scoped to shared leagues only.

**Schema changes:** None.

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `GET /api/users/[userId]` | authenticated; shared league required | Returns `name`, `email` (masked to first character + domain), `createdAt`, per-league stats (correct picks, total picks, accuracy %, sport); 403 if no shared league |
| `PATCH /api/users/me` | authenticated | Update `name` for the current user |

**UI changes:**

- `/profile/[userId]` — profile page; shows display name, join date, stats table (league, sport, correct picks, total picks, accuracy %), recent pick history
- `/settings` — current user's settings page; includes a form to update display name

---

### 4. Tie-breaker questions

**Status: Not started**

A slate can have one or more tie-breaker questions. Each question is numeric (e.g. "Total combined score in Game 3?"). Members submit a response before the lock deadline (30 minutes before the slate's first game starts). After the slate completes, the admin sets the correct answer. Proximity determines tie-breaking order (Price Is Right rules: closest without going over wins; if all go over, closest wins).

Tie-breaker responses use the same lock deadline as picks: `min(game.startTime in slate) - 30 minutes`.

**Design intent (long-term):** Tie-breaker questions should eventually be auto-linked to the marquee game in the slate so the question and lock time are derived automatically. For Phase 3, admins create questions manually with no game association; the game link is future work.

**Schema changes:**

- Add `TiebreakerQuestion` model: `id`, `slateId`, `question`, `answer?` (nullable until admin sets it), `position`
- Add `TiebreakerResponse` model: `id`, `userId`, `questionId`, `response`; unique `(userId, questionId)`
- Add `tiebreakerQuestions TiebreakerQuestion[]` relation to `Slate`
- Add `tiebreakerResponses TiebreakerResponse[]` relation to `User`

**API changes:**

| Route | Auth | Notes |
|---|---|---|
| `GET /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` | member | List questions; `answer` field omitted until slate status is `completed` |
| `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers` | admin | Create a question (`question`, `position`) |
| `POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]/responses` | member | Submit or update numeric response; 400 if past the lock deadline |
| `PATCH /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]` | admin | Set correct `answer` |

**Leaderboard integration:** When two members have the same correct pick count, tie-breaker proximity is the secondary sort key. Proximity is scored per question as `1 / (1 + |response - answer|)` for responses that did not go over, and `0` for responses that went over (Price Is Right rules). Scores across all questions in the slate are summed. Members who submitted at least one response rank above those who submitted none. The leaderboard `GET /api/leagues/[leagueId]/leaderboard` will apply this logic when the slate has tie-breaker questions with answers set.

**UI changes:**

- On the active slate view (`/leagues/[leagueId]`), show tie-breaker question(s) with a numeric input; disabled after the lock deadline
- On the completed slate view, show the correct answer and each member's response

---

## Schema changes required

| Change | Model | Details | Status |
|---|---|---|---|
| Add `TiebreakerQuestion` | new model | `id`, `slateId`, `question`, `answer?`, `position` | Not started |
| Add `TiebreakerResponse` | new model | `id`, `userId`, `questionId`, `response`; unique `(userId, questionId)` | Not started |
| Add relation | `Slate` | `tiebreakerQuestions TiebreakerQuestion[]` | Not started |
| Add relation | `User` | `tiebreakerResponses TiebreakerResponse[]` | Not started |

Tasks 1 (UI gaps), 2 (league settings), and 3 (user profiles) require no schema changes.

Custom game lists were deferred out of Phase 3 — extend `prisma/seed.ts` if schedule gaps arise. Revisit in Phase 4.

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| Home page league list | No | `/` has no league list; no navigation to leagues |
| League home / games view | No | No `/leagues/[leagueId]` page; API-only |
| Pick submission UI | No | `POST /picks` API exists; no UI |
| Slate-based pick lock time | No | Currently locks per game at `game.startTime`; needs to change to 30 min before slate's first game |
| Admin slate management UI | No | All slate/game/score APIs exist; no UI |
| League detail endpoint | No | No `GET /api/leagues/[leagueId]`; needed by settings page and league home |
| League rename | No | No `PATCH /api/leagues/[leagueId]` route |
| Member list / role management | No | No `/members` routes |
| Member removal | No | No `DELETE /members/[userId]` route |
| User profile page | Yes | `/profile/[userId]`; stats table, pick history, edit profile link |
| User name update | Yes | `PATCH /api/users/me`; `/settings` page |
| Tie-breaker questions | No | Schema and API not yet built |
| Tie-breaker leaderboard integration | No | Leaderboard does not apply proximity scoring |
| Custom game lists | Deferred | Out of scope for Phase 3; extend seed data instead |
