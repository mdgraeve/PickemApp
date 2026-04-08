# Phase 4 -- UI Polish

**Status: In progress**

Phase 4 makes the app feel production-ready and sport-appropriate. All work is purely cosmetic and structural — no schema changes, no new API surface. Tasks ship incrementally and build on a shared dark design system established in Task 1.

---

## Visual Direction

- **Theme:** Dark-first (single theme, no light/dark toggle)
- **Background:** `slate-950` (#0f172a) for page, `slate-900` for cards
- **Accent:** `blue-600` / `blue-500` hover for interactive elements (buttons, active tabs, links, focus rings)
- **Text:** `white` primary, `slate-400` secondary, `slate-500` muted
- **Borders:** `slate-800` standard, `slate-700` hover/focus
- **Status colors:** Green for correct picks, red for wrong picks (unchanged)
- **Content width:** `max-w-4xl` for main pages; `max-w-md` for focused flows (login, create league, user settings)
- **Cards:** `bg-slate-900 rounded-2xl border border-slate-800 shadow-md`
- **Primary buttons:** `bg-blue-600 hover:bg-blue-500 text-white rounded-lg`
- **Secondary buttons:** `border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-slate-300 rounded-lg`
- **Inputs:** `bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg`

**Feel:** DraftKings / ESPN — slick, dark, modern sports SaaS.

---

## Goals

1. **Dark design system** — establish a slate-based dark theme as the single visual identity across the entire app; replace the previous zinc/light-mode palette.
2. **Persistent navigation** — a sticky top bar on every page so users can always orient themselves and move between league sections without hunting for back links.
3. **Visual polish** — improve typography hierarchy, card layouts, pick buttons, and space utilization across all pages; widen content to `max-w-4xl`.
4. **Mobile layout** — ensure all pages are comfortable at 375px; fix overflow, cramped tap targets, and admin panel pain points.
5. **Loading skeletons** — replace plain "Loading..." text with shaped, animated placeholder elements.
6. **Empty states** — replace bare "nothing here" messages with actionable copy and CTAs.
7. **Team logos** — pull team logo images from ESPN's public CDN to make game cards immediately recognizable.

---

## Tasks

### 1. Theme & Global Styles

**Status: Complete**

Updated `app/globals.css` and `app/layout.tsx`:
- CSS variables set to `slate-950` background, `slate-50` foreground
- Removed light-mode `@media (prefers-color-scheme: dark)` toggle
- Body class updated to `bg-slate-950 text-white antialiased`
- Font family wired to Geist via CSS custom property

**Files changed:** `app/globals.css`, `app/layout.tsx`
**Schema changes:** None.
**API changes:** None.

---

### 2. Persistent Navigation Bar

**Status: Complete**

Replaced ad-hoc back-link pattern with a sticky top nav rendered in the root layout.

- **Outside a league:** LockHub wordmark (left) + user name/sign-out (right)
- **Inside a league:** wordmark → league name breadcrumb (left) → Picks / Leaderboard / Admin / Settings tabs (center) → user/sign-out (right)
- Admin tab and Settings tab only shown when `role === "admin"`
- Active tab: `bg-slate-800 text-white`; inactive: `text-slate-400 hover:text-white`
- Mobile: hamburger button opens a dropdown with all links
- Nav height `h-14`, sticky top, `bg-slate-950/90 backdrop-blur border-b border-slate-800`
- League info (name, role) fetched from `/api/leagues/[leagueId]` client-side when inside a league route

**New file:** `app/components/nav.tsx`
**Schema changes:** None.
**API changes:** None.

---

### 3. Visual Polish — All Pages

**Status: Complete**

Full restyle of every page using the new dark design system:

- Replace all `bg-white`, `bg-zinc-*`, `text-zinc-*`, `border-zinc-*` with slate equivalents
- Headings: `text-3xl font-bold` for h1, `text-xl font-semibold` for h2
- Game cards: larger team names, bigger pick buttons (`py-4`), blue `ring-2 ring-blue-500` for selected pick
- Leaderboard: medal indicators (🥇🥈🥉) for top 3; current user row highlighted with `bg-blue-950/40`
- Admin panel: `rounded-2xl` cards, smooth `transition-all` on expand/collapse
- Profile stats: 3-column grid layout
- Remove all `← Back` and `← Home` links (nav covers this)
- Container widths: `max-w-4xl` for main pages; `max-w-md`/`max-w-lg` for focused flows

**Files changed:** All page files under `app/`
**Schema changes:** None.
**API changes:** None.

---

### 4. Mobile Layout

**Status: Complete**

Audited and fixed all pages at 375px viewport width:

- **Leaderboard:** Reduced cell padding to `px-3 sm:px-5`; hid "Picked" column on mobile (`hidden sm:table-cell`)
- **Picks page:** Slate header uses `flex-wrap` so lock deadline wraps below title on small screens
- **Admin — game list:** Date/time moved to its own line below team names; score entry row uses `flex-wrap`
- **Admin — Add Games:** Checkbox aligns to top; team matchup and date on separate lines inside the label
- **Settings — Members:** Reduced row padding to `px-3 sm:px-5`; role badge hidden on mobile for non-self (Demote/Promote implies role); always shown for current user row
- Nav: hamburger menu was already implemented in Task 2
- Pick buttons: `flex-1 py-4` already provides sufficient tap targets (≥44px)

**Schema changes:** None.
**API changes:** None.

---

### 5. Loading Skeletons

**Status: Complete**

Created `app/components/skeleton.tsx` with reusable animated primitives:
- `<Skeleton>` — base pulse rectangle
- `<SkeletonCard>` — card-shaped with N lines
- `<SkeletonRow>` — table row shape
- `<SkeletonGameCard>` — game card with two team button shapes
- `<PageLoader>` — centered spinning ring for full-page loads

All `"Loading..."` text replaced with `<PageLoader />` across every page. Home page league list uses `<SkeletonCard>` while fetching.

**New file:** `app/components/skeleton.tsx`
**Schema changes:** None.
**API changes:** None.

---

### 6. Empty States

**Status: Complete**

Created `app/components/empty-state.tsx` with an `<EmptyState>` component accepting `icon`, `title`, `description`, and `actions[]`.

| Location | Message | Action |
|---|---|---|
| Home — no leagues | "No leagues yet" | "Create League" (primary) + "Join with Code" (secondary) |
| League home — no active slate | Admin: "No active slate" / Member: "Check back soon" | Admin gets link to Admin panel |
| Admin — no slates | "No slates yet" | Prompt to create first slate |
| Leaderboard — no scored games | "Standings update as games are scored" | None |
| Slate history — no completed slates | "No completed slates yet" | None |

**New file:** `app/components/empty-state.tsx`
**Schema changes:** None.
**API changes:** None.

---

### 7. Team Logos

**Status: Not started**

Create `lib/team-logos.ts` mapping `(sport, teamName)` → ESPN CDN logo URL:

```
https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png
```

- Cover NFL, NBA, MLB, NHL, NCAAF, NCAAB team names → abbreviations
- Return `null` for unknown teams (render nothing — no broken image)
- Render via `<Image>` with `unoptimized` (external CDN) as `w-8 h-8 object-contain rounded-full`
- Show alongside team names on game cards (picks page + slate history page)

**New file:** `lib/team-logos.ts`
**Schema changes:** None.
**API changes:** None — logos fetched directly by the browser from ESPN's CDN.

---

## Shared Components

| File | Purpose |
|---|---|
| `app/components/nav.tsx` | Persistent top navigation bar |
| `app/components/skeleton.tsx` | Animated loading placeholder primitives |
| `app/components/empty-state.tsx` | Reusable empty state with icon, title, description, actions |

---

## What the current codebase supports

| Requirement | Supported now? | Notes |
|---|---|---|
| Dark design system | Yes | Completed in Task 1 |
| Persistent navigation | Yes | Completed in Task 2 |
| Visual polish | Yes | Completed in Task 3 |
| Mobile-optimised layout | Yes | Completed in Task 4 |
| Loading skeletons | Yes | Completed in Task 5 |
| Actionable empty states | Yes | Completed in Task 6 |
| Team logos | No | Task 7 not started |
