import { describe, it, expect, vi, beforeEach } from "vitest";

const { nextAuthHandler } = vi.hoisted(() => ({
  nextAuthHandler: vi.fn(async () => new Response("nextauth-handled")),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => nextAuthHandler),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true, retryAfterMs: 0 })),
}));

import { POST } from "../route";
import { checkRateLimit } from "@/lib/rate-limit";

const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

function makeContext(segments: string[]) {
  return { params: Promise.resolve({ nextauth: segments }) };
}

function makeSignInRequest(
  email: string,
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost/api/auth/signin/email", {
    method: "POST",
    headers,
    body: new URLSearchParams({ email, csrfToken: "token" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ ok: true, retryAfterMs: 0 });
});

describe("POST /api/auth/signin/email rate limiting", () => {
  it("delegates to NextAuth when under the limit", async () => {
    const res = await POST(
      makeSignInRequest("friend@example.com"),
      makeContext(["signin", "email"]),
    );

    expect(await res.text()).toBe("nextauth-handled");
    expect(nextAuthHandler).toHaveBeenCalledOnce();
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "magic-link:email:friend@example.com",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("normalizes the email used for the rate-limit key", async () => {
    await POST(
      makeSignInRequest("  Friend@Example.COM "),
      makeContext(["signin", "email"]),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "magic-link:email:friend@example.com",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("rate limits by IP from x-forwarded-for", async () => {
    await POST(
      makeSignInRequest("friend@example.com", {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      }),
      makeContext(["signin", "email"]),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "magic-link:ip:203.0.113.7",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("returns 429 with Retry-After when the email limit is exceeded", async () => {
    mockCheckRateLimit.mockImplementation((key: string) =>
      key.startsWith("magic-link:email:")
        ? { ok: false, retryAfterMs: 120_000 }
        : { ok: true, retryAfterMs: 0 },
    );

    const res = await POST(
      makeSignInRequest("friend@example.com"),
      makeContext(["signin", "email"]),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
    expect(body.url).toBe("http://localhost/login?error=RateLimited");
    expect(nextAuthHandler).not.toHaveBeenCalled();
  });

  it("returns 429 when the IP limit is exceeded", async () => {
    mockCheckRateLimit.mockImplementation((key: string) =>
      key.startsWith("magic-link:ip:")
        ? { ok: false, retryAfterMs: 60_000 }
        : { ok: true, retryAfterMs: 0 },
    );

    const res = await POST(
      makeSignInRequest("friend@example.com"),
      makeContext(["signin", "email"]),
    );

    expect(res.status).toBe(429);
    expect(nextAuthHandler).not.toHaveBeenCalled();
  });

  it("does not rate limit other NextAuth POST routes", async () => {
    const req = new Request("http://localhost/api/auth/callback/email", {
      method: "POST",
      body: new URLSearchParams({ csrfToken: "token" }),
    });

    const res = await POST(req, makeContext(["callback", "email"]));

    expect(await res.text()).toBe("nextauth-handled");
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("lets NextAuth handle unparseable bodies", async () => {
    const req = new Request("http://localhost/api/auth/signin/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-form-data",
    });

    const res = await POST(req, makeContext(["signin", "email"]));

    expect(await res.text()).toBe("nextauth-handled");
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});
