import { test, expect, type Browser, type Page } from "@playwright/test";
import { db, signInAs } from "./helpers/seed";

// ---------------------------------------------------------------------------
// Critical-path E2E: join a league via invite link → submit picks → admin
// records game scores → leaderboard reflects the result.
//
// Auth state is seeded directly in the database (User + Session rows plus the
// session cookie) — magic-link click-through stays out of scope.
// Tests run serially because each step builds on the previous one's state.
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });

const runId = Date.now();
const adminEmail = `e2e-admin-${runId}@example.test`;
const memberEmail = `e2e-member-${runId}@example.test`;

// Fictional team names so nothing collides with real schedule data.
const game1Away = "Testville Turbines";
const game1Home = "Mockford Mallards";
const game2Away = "Fixture Falcons";
const game2Home = "Sample City Stags";

type Fixture = {
  adminToken: string;
  memberToken: string;
  leagueId: string;
  inviteCode: string;
  game1Id: string;
  game2Id: string;
};
type Status = {
  memberRole: string | null;
  pickCount: number;
  slateStatus: string | null;
};

let fixture: Fixture;

async function newSignedInPage(browser: Browser, token: string): Promise<Page> {
  const context = await browser.newContext();
  await signInAs(context, token);
  return context.newPage();
}

function currentStatus(): Status {
  return db<Status>("status", { leagueId: fixture.leagueId, memberEmail });
}

test.beforeAll(() => {
  fixture = db<Fixture>("setup", {
    adminEmail,
    memberEmail,
    leagueName: `E2E League ${runId}`,
    game1Home,
    game1Away,
    game2Home,
    game2Away,
  });
});

test.afterAll(() => {
  db("teardown", {
    leagueId: fixture?.leagueId,
    emails: [adminEmail, memberEmail],
  });
});

test("invite link carries signed-out visitors to login with the join callback", async ({ page }) => {
  await page.goto(`/join/${fixture.inviteCode}`);
  await expect(page).toHaveURL(
    new RegExp(`/login\\?callbackUrl=${encodeURIComponent(`/join/${fixture.inviteCode}`)}`),
  );
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("member joins the league via the invite link", async ({ browser }) => {
  const page = await newSignedInPage(browser, fixture.memberToken);
  await page.goto(`/join/${fixture.inviteCode}`);

  await expect(page).toHaveURL(new RegExp(`/leagues/${fixture.leagueId}$`));
  await expect(page.getByRole("heading", { name: "Week 1" })).toBeVisible();

  expect(currentStatus().memberRole).toBe("member");
});

test("re-opening the invite link as an existing member goes straight to the league", async ({ browser }) => {
  const page = await newSignedInPage(browser, fixture.memberToken);
  await page.goto(`/join/${fixture.inviteCode}`);
  await expect(page).toHaveURL(new RegExp(`/leagues/${fixture.leagueId}$`));
});

test("member submits picks for both games", async ({ browser }) => {
  const page = await newSignedInPage(browser, fixture.memberToken);
  await page.goto(`/leagues/${fixture.leagueId}`);

  const pick1 = page.getByRole("button", { name: game1Away });
  await expect(pick1).toBeEnabled();
  await pick1.click();
  await expect(pick1).toHaveClass(/bg-blue-600/);

  const pick2 = page.getByRole("button", { name: game2Away });
  await pick2.click();
  await expect(pick2).toHaveClass(/bg-blue-600/);

  // Picks survive a reload (persisted, not just local state).
  await page.reload();
  await expect(page.getByRole("button", { name: game1Away })).toHaveClass(/bg-blue-600/);

  expect(currentStatus().pickCount).toBe(2);
});

test("admin records final scores for both games", async ({ browser }) => {
  const page = await newSignedInPage(browser, fixture.adminToken);
  await page.goto(`/leagues/${fixture.leagueId}/admin`);

  // Expand the slate to reveal its games.
  await page.getByRole("button", { name: /Week 1/ }).click();

  async function recordScore(awayTeam: string, away: number, home: number) {
    // .last() = innermost match: the slate <li> wrapping all games also
    // matches hasText, the game's own <li> is nested inside it.
    const gameRow = page.locator("li", { hasText: awayTeam }).last();
    await gameRow.getByRole("button", { name: "Override score manually" }).click();
    const inputs = gameRow.getByRole("spinbutton");
    await inputs.nth(0).fill(String(away));
    await inputs.nth(1).fill(String(home));
    await gameRow.getByRole("button", { name: "Save Final Score" }).click();
    await expect(gameRow.getByText(`Final: ${away}–${home}`)).toBeVisible();
  }

  // Game 1: away team wins → member's pick is correct.
  await recordScore(game1Away, 27, 13);
  // Game 2: home team wins → member's pick is wrong.
  await recordScore(game2Away, 10, 24);

  // Scoring every game triggers slate promotion — with no next slate, the
  // active slate simply completes.
  expect(currentStatus().slateStatus).toBe("completed");
});

test("leaderboard reflects the recorded results", async ({ browser }) => {
  const page = await newSignedInPage(browser, fixture.memberToken);
  await page.goto(`/leagues/${fixture.leagueId}/leaderboard`);

  const memberRow = page.getByRole("row").filter({ hasText: "E2E Member" });
  await expect(memberRow).toContainText("1-1");

  // Member (1 correct) ranks above the admin, who made no picks.
  const firstDataRow = page.getByRole("row").nth(1);
  await expect(firstDataRow).toContainText("E2E Member");
});
