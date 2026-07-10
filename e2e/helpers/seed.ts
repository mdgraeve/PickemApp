// Test helpers for Playwright E2E specs.
//
// DB access goes through e2e/helpers/db-cli.ts in a tsx child process — the
// Playwright transpiler cannot load the generated TypeScript Prisma client
// directly, and tsx (used by prisma/seed.ts too) handles it fine.
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const CLI = path.join(__dirname, "db-cli.ts");
const TSX = path.join(
  __dirname,
  "..",
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

export function db<T>(command: "setup" | "status" | "teardown", payload: unknown): T {
  const stdout = execFileSync(TSX, [CLI, command], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    // .cmd shims require a shell on Windows
    shell: process.platform === "win32",
  });
  return JSON.parse(stdout) as T;
}

/** Sign a browser context in by installing the NextAuth session cookie. */
export async function signInAs(context: BrowserContext, sessionToken: string) {
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: sessionToken,
      url: BASE_URL,
    },
  ]);
}
