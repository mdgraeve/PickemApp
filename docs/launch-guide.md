# LockHub Launch Guide — Your Remaining Steps, In Order

This is the complete, ordered list of everything **you** need to do by hand to get LockHub live at `lockhubsports.com` and ready for the friends test. All the Phase 7 code work is done — these are the account/dashboard/DNS steps that Claude is intentionally not allowed to do for you.

Every step says exactly where to click and what to type. Do them in order — later steps depend on earlier ones.

**Two safety rules that apply throughout:**
- Never paste secret values (connection strings, API keys, generated secrets) into a Claude chat. Enter them directly into the dashboard that needs them.
- Your local `.env` should **always** keep pointing at your dev database. You will never edit it to contain production values.

**Already done (no action needed):** domain purchased (`lockhubsports.com`), Resend sending domain added (`contact.lockhubsports.com`), Sentry project created and wired into the code, all Phase 7 code tasks.

---

## Step 1 — Fix local magic-link sign-in (Norton)

**Why:** The TLS-verification bypass was removed from the code (it must never reach production). Norton on this PC intercepts secure email connections, so local sign-in emails will fail until you do ONE of the following:

**Option A (recommended):** Stop Norton from scanning outgoing email.
1. Open Norton 360 → **Settings** (gear icon).
2. Go to **AntiVirus** → **Scans and Risks** tab.
3. Find **Email Antivirus Scan** (may be labeled "Safe Email" or similar) and turn it **off** for outgoing (SSL) connections.
4. Restart your dev server if it's running.

**Option B (quick workaround):** Open `C:\Projects\PickemApp\.env` in a text editor and add this line at the bottom:
```
EMAIL_ALLOW_INTERCEPTED_TLS=true
```
This flag only works in local development — production ignores it completely, so it can't weaken the real site.

**While you have `.env` open**, also update the sender address to your verified Resend domain:
```
EMAIL_FROM=LockHub <login@contact.lockhubsports.com>
```

**Verify:** run `npm run dev`, go to `http://localhost:3000/login`, request a magic link to your email, confirm it arrives and signs you in.

---

## Step 2 — Resend: confirm the domain and create a production API key

1. Go to [resend.com](https://resend.com) → sign in → **Domains**.
2. Confirm `contact.lockhubsports.com` shows status **Verified** (all DNS records green). If it's still "Pending", wait for DNS to propagate — nothing else works until this is green.
3. Go to **API Keys** → **Create API Key**:
   - Name: `lockhub-production`
   - Permission: **Sending access** is enough.
4. Copy the key somewhere temporary and safe (you'll paste it into Vercel in Step 5, then delete your copy). Resend only shows it once.

---

## Step 3 — Neon: create the production database and run migrations

**Why:** Friends' real picks must live in a database your local hacking can never touch.

1. Go to [console.neon.tech](https://console.neon.tech) → **New Project**.
   - Name: `lockhub-prod`
   - Postgres version / region: defaults are fine (pick a US region).
2. On the project dashboard, find **Connection string**. Choose the **pooled** connection string (it contains `-pooler` in the hostname). Copy it.
3. Now apply the schema. Open a **brand-new PowerShell window** (Start → type "PowerShell") and run these three lines — paste your production connection string inside the quotes:
   ```powershell
   cd C:\Projects\PickemApp
   $env:DATABASE_URL = "PASTE-THE-NEON-PRODUCTION-CONNECTION-STRING-HERE"
   npx prisma migrate deploy
   ```
4. You should see a list of migrations ending with something like "All migrations have been applied." If you see an error instead, stop and ask Claude — paste the error only, not the connection string.
5. **Close that PowerShell window.** That removes the temporary production setting; your normal terminals and `.env` still point at dev.

Keep the connection string handy for Step 5, then delete your copy.

---

## Step 4 — Generate two secrets

You need two random secrets for production (do **not** reuse the ones in your dev `.env`). In any terminal, run this **twice** and save both outputs temporarily:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- First output → this will be `NEXTAUTH_SECRET` (signs login sessions).
- Second output → this will be `CRON_SECRET` (authenticates the score-sync cron).

---

## Step 5 — Vercel: create the project and set environment variables

1. Go to [vercel.com](https://vercel.com) → sign up / sign in **with your GitHub account** (that's how it sees your repo).
2. Click **Add New… → Project** → under "Import Git Repository" find **mdgraeve/PickemApp** → **Import**.
   - If the repo isn't listed, click "Adjust GitHub App Permissions" and grant Vercel access to it.
3. Framework preset should auto-detect **Next.js**. Leave build settings alone.
4. **Before clicking Deploy**, expand the **Environment Variables** section and add every row below (Environment: leave as all/Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon **production** pooled connection string from Step 3 |
   | `NEXTAUTH_URL` | `https://lockhubsports.com` |
   | `NEXTAUTH_SECRET` | first generated secret from Step 4 |
   | `EMAIL_SERVER_HOST` | `smtp.resend.com` |
   | `EMAIL_SERVER_PORT` | `465` |
   | `EMAIL_SERVER_USER` | `resend` |
   | `EMAIL_SERVER_PASSWORD` | the Resend API key from Step 2 |
   | `EMAIL_FROM` | `LockHub <login@contact.lockhubsports.com>` |
   | `APP_ADMIN_EMAILS` | `mdgraeve@gmail.com` |
   | `CRON_SECRET` | second generated secret from Step 4 |

   Do **NOT** add `NEXT_PUBLIC_DISABLE_PICK_LOCK` or `EMAIL_ALLOW_INTERCEPTED_TLS` — they must not exist in production.
5. Click **Deploy**. This first deploy builds whatever is currently on `main` (it won't have the Phase 7 code yet — that arrives in Step 7). If the build fails here, that's OK to ignore for now.
6. **Upgrade to Pro:** Vercel dashboard → your account/team → **Settings → Billing** → upgrade to **Pro** ($20/mo). This is required because the score-sync cron runs every 5 minutes; the free plan only allows once-per-day crons and will reject the deploy or silently under-run it.

---

## Step 6 — Point your domain at Vercel (Namecheap DNS)

1. In Vercel: your project → **Settings → Domains** → type `lockhubsports.com` → **Add**. When asked, choose to also add `www.lockhubsports.com` redirecting to the apex (the recommended default). Vercel now shows you the DNS records it needs.
2. In another tab, go to [namecheap.com](https://www.namecheap.com) → **Domain List** → `lockhubsports.com` → **Manage** → **Advanced DNS** tab.
3. Add these records (they match what Vercel shows — trust Vercel's screen if it differs):
   - **A Record** — Host: `@` — Value: `76.76.21.21` — TTL: Automatic
   - **CNAME Record** — Host: `www` — Value: `cname.vercel-dns.com` — TTL: Automatic
4. ⚠ **Do not delete or edit the existing records for the `contact` subdomain** (MX/TXT/CNAME records Resend had you add) — those keep your sign-in emails working.
5. Back in Vercel → Settings → Domains: wait for both domains to show **Valid Configuration** (usually minutes, can take up to an hour). Vercel provisions the HTTPS certificate automatically.

---

## Step 7 — Ship the Phase 7 code (this triggers the real production deploy)

The Phase 7 work currently sits uncommitted on the `phase-7-friends-readiness` branch. Easiest path: ask Claude to *"commit the phase 7 work"*, then run the merge yourself (pushing to `main` deploys production, so it's your call to make):

```powershell
cd C:\Projects\PickemApp
git checkout main
git merge phase-7-friends-readiness
git push origin main
```

Vercel picks up the push automatically and deploys. Watch it: Vercel dashboard → project → **Deployments** → the new build should end in **Ready**.

---

## Step 8 — Verify production works (10 minutes, do all of these)

1. **Site loads:** visit `https://lockhubsports.com` — homepage renders.
2. **Sign-in works end-to-end:** click Get Started / sign in with `mdgraeve@gmail.com` → magic-link email arrives (check spam the first time; from `login@contact.lockhubsports.com`) → clicking it signs you in.
3. **Second address test:** sign in with a different email you own (or a family member's) to prove delivery isn't limited to the account owner.
4. **Cron is registered:** Vercel → project → **Settings → Cron Jobs** → you should see `/api/cron/sync-scores` every 5 minutes. Then check **Logs** (filter by that path): each tick should return **200**. A 401 here means `CRON_SECRET` wasn't set; a 405 means the deployed code is stale (Step 7 didn't ship).
5. **Sentry is receiving:** [sentry.io](https://sentry.io) → project `javascript-nextjs` → Issues. Visit `https://lockhubsports.com/some-page-that-does-not-exist` a few times; nothing may show (404s aren't errors) — that's fine, this is just to know where to look. Real errors will appear here.

---

## Step 9 — Sentry email alerts

1. [sentry.io](https://sentry.io) → **Alerts** (left sidebar) → **Create Alert** → choose **Issues** → conditions: "A new issue is created" → action: send email to your team/you → name it `new-errors` → save.
2. Also check **Settings → Notifications** on your personal account: make sure Issue Alerts deliver to `mdgraeve@gmail.com`.

*(Optional, nice-to-have)*: for readable stack traces in Sentry, add a `SENTRY_AUTH_TOKEN` env var in Vercel — create the token at Sentry → Settings → Auth Tokens (scope: `project:releases`), add it in Vercel → Settings → Environment Variables, then redeploy. Skip if this feels like too much; errors still get reported without it.

---

## Step 10 — Create the two leagues and get the join links

On `https://lockhubsports.com`, signed in as yourself:

1. Create the **NFL** league (Create League → sport: NFL).
2. Create the **NCAAF** league (sport: NCAAF).
3. In each league: **Admin** → **Auto-create Slate** → pick the preseason week → Preview Games → create the slate.
4. In each league: **Settings** → Invite section → **Copy link**. That link (`https://lockhubsports.com/join/…`) is what you text your friends — they click it, sign in with their email, and land in the league automatically.

---

## Step 11 — Preseason dry run (early August 2026)

1. Send the join link to **1–3 friends only**.
2. Have each of them: click the link → sign in via magic link → submit picks on the preseason slate.
3. Watch a game day happen: scores should appear automatically (the cron polls ESPN every 5 minutes), games flip to Final, and the leaderboard updates without you touching anything.
4. If a score gets stuck: league → Admin → expand the slate → **Override score manually** (break-glass), and tell Claude so the root cause gets fixed before the real season.
5. Check Sentry after the dry run — it should be quiet.

## Step 12 — Full launch (before NFL Week 1, September 2026)

- Send both join links to the full group (10–15 friends).
- Create the Week 1 slates via Auto-create Slate.
- Confirm the pick lock message ("Locks …") shows a sensible time for friends in other time zones (times display in each viewer's local zone).
- Final go/no-go: run down the readiness checklist at the bottom of [phase-7.md](phase-7.md).

---

## If anything goes wrong

Copy the error message (never the secret values) into a Claude chat and say which step you were on. Steps 1–6 are all reversible and re-runnable; nothing here can destroy data.
