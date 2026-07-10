# Phase 7 — Friends Test Readiness

**Status: Planned**

## Overview

Phase 7 gets LockHub from "runs on my laptop" to "a small group of real friends can sign in, join a league, and pick real NFL and NCAAF games without anything breaking or embarrassing me." It is a hardening and operational-readiness phase, not a feature phase — the pick/slate/leaderboard functionality already built in Phases 1–6 is considered feature-complete for this test.

**Target audience:** 10–15 friends, across two separate leagues (one NFL, one NCAAF — the data model is single-sport-per-league, so this is two leagues, not one combined league; no schema change).

**Target timeline:** Preseason soft-launch (~August 2026), with a small dry run (a handful of preseason games) before real regular-season stakes begin in September.

**Explicitly out of scope for this phase** (deferred, not forgotten):
- Migrating manual validation to `zod` — current per-route manual validation is adequate; revisit only if a real validation bug surfaces.
- Combined multi-sport leagues — would require schema changes (`Slate`/`Game` sport-independent of `League`); not needed since two leagues covers the goal.
- Restricting league creation to app admins — left open; low risk at this scale.

---

## Tasks

### 1. Domain purchase & DNS

**Status: Not started**
**Blocks:** Tasks 2, 3 (Vercel custom domain + Resend domain verification both need this first)

- Purchase a domain (or subdomain of an existing one).
- Point DNS at Vercel for the app (A/CNAME per Vercel's instructions once the project exists).
- Add the domain's DNS records required by Resend for sender verification (SPF/DKIM/DMARC — Resend's domain setup flow specifies exact records).

---

### 2. Production deployment on Vercel

**Status: Not started**
**Depends on:** Task 1 (domain)

- Create the Vercel project, link the GitHub repo, upgrade to **Pro** ($20/mo) — required because `vercel.json`'s score-sync cron runs every 5 minutes, and Vercel's Hobby plan caps cron frequency at once/day.
- Attach the purchased domain.
- Set production environment variables (new values, not copied from dev): `DATABASE_URL` (see Task 4), `NEXTAUTH_URL` (the production domain), `NEXTAUTH_SECRET` (freshly generated), `EMAIL_SERVER_*` / `EMAIL_FROM` (see Task 3), `APP_ADMIN_EMAILS`, `CRON_SECRET` (freshly generated). Confirm `NEXT_PUBLIC_DISABLE_PICK_LOCK` is **not** set in production.
- Verify the `/api/cron/sync-scores` Vercel Cron trigger is active post-deploy.

**Schema changes:** None. **API changes:** None.

---

### 3. Fix SMTP TLS + verify sending domain

**Status: Not started**
**Depends on:** Task 1 (domain, for Resend verification)

- Root-cause the cert error that led to `tls: { rejectUnauthorized: false }` in `lib/auth.ts` (most likely an EMAIL_SERVER_PORT/STARTTLS mismatch — e.g. port 465 implicit-TLS vs port 587 STARTTLS options being mixed). Fix properly; remove the verification bypass.
- Verify the purchased domain in Resend; update `EMAIL_FROM` to use it instead of the `onboarding@resend.dev` sandbox sender.
- Manually test: request a magic link to an external (non-account-owner) email address and confirm delivery.

**Files likely touched:** `lib/auth.ts`.
**Schema changes:** None. **API changes:** None.

---

### 4. Separate production database

**Status: Not started**

- Create a new Neon database/branch dedicated to production — distinct from the dev database in `.env`.
- Point the Vercel production `DATABASE_URL` at it.
- Run `npx prisma migrate deploy` against it.
- Leave local `.env` pointed at the existing dev database so local hacking never touches friends' data.

**Schema changes:** None (migration only). **API changes:** None.

---

### 5. Rate limit the magic-link request endpoint

**Status: Not started**

- Apply the existing `lib/rate-limit.ts` limiter to the sign-in / magic-link request route (NextAuth's email provider request endpoint), matching the pattern already used on picks/auto-preview/sync-espn (a few requests per email or IP per 15 minutes).
- Confirm legitimate sign-in flows aren't tripped by normal use (e.g. a friend requesting a link, not receiving it fast enough, requesting again once).

**Files likely touched:** NextAuth route/config in `lib/auth.ts`, `lib/rate-limit.ts` usage.
**Schema changes:** None. **API changes:** Sign-in request may now return 429 under abuse.

---

### 6. Error monitoring (Sentry)

**Status: Not started**

- Add Sentry (free tier) to the Next.js app — server, edge, and client instrumentation.
- Confirm errors from API routes and the cron job are captured with useful context (route, user/league where available).
- Set up email alerting so a broken flow surfaces without a friend having to report it.

**Schema changes:** None. **API changes:** None.

---

### 7. E2E coverage for the critical path

**Status: Not started**

- Extend the Playwright suite beyond the current smoke test to cover: join a league (via invite code) → submit a pick → admin records a game score → leaderboard reflects the result.
- Magic-link click-through stays out of scope for automation (real email); seed/auth state directly for these tests instead.

**Files likely touched:** `e2e/` directory (new spec file(s) alongside `e2e/smoke.test.ts`).
**Schema changes:** None. **API changes:** None.

---

### 8. Shareable join link

**Status: Not started**

- Add a `/join/[code]` page that reads the invite code from the URL and either auto-submits the join request (if signed in) or carries the code through sign-in and auto-submits after.
- Update the league settings/invite UI to surface this link (e.g. "Copy invite link") alongside the raw code.

**Files likely touched:** New route under `app/join/[code]/`, `app/leagues/[leagueId]/settings/page.tsx` (or wherever the invite code is currently displayed), `app/api/leagues/join/route.ts` (confirm it already accepts a code param cleanly — no change expected).
**Schema changes:** None. **API changes:** None expected (reuses existing join endpoint).

---

### 9. Launch

**Status: Not started**
**Depends on:** All above

- Create the two production leagues (NFL, NCAAF) using the app owner's account.
- Generate and distribute the two join links.
- Preseason dry run: pick a small set of preseason games, walk through the full flow live with 1–3 friends before opening to the full group of 10–15.
- Confirm regular-season readiness ahead of Week 1 (September): schedule import for the new season, lock deadlines behaving correctly across friends' time zones, Sentry quiet, cron running.

---

## Readiness checklist (go/no-go before inviting friends)

- [ ] Production deployment live on the purchased domain, Vercel Pro active
- [ ] Magic-link email delivers to non-owner addresses (Resend domain verified, TLS fixed)
- [ ] Production database separate from dev, migrated
- [ ] Magic-link endpoint rate-limited
- [ ] Sentry capturing errors with alerting on
- [ ] E2E critical-path tests passing in CI (or run manually pre-launch)
- [ ] Shareable join links working for both leagues
- [ ] `NEXT_PUBLIC_DISABLE_PICK_LOCK` unset in production
- [ ] Preseason dry run completed with no unresolved issues
