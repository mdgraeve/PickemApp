import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { update: vi.fn() },
  },
}));

import { PATCH } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/users/me", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ name: "Alice" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when name is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await PATCH(makeRequest({}));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("name is required");
  });

  it("returns 400 when name is blank", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await PATCH(makeRequest({ name: "   " }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("name is required");
  });

  it("updates and returns user with trimmed name", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockUserUpdate.mockResolvedValue({ id: "user-1", name: "Alice", email: "alice@example.com" });
    const res = await PATCH(makeRequest({ name: "  Alice  " }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: "user-1", name: "Alice", email: "alice@example.com" });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Alice" },
      select: { id: true, name: true, email: true },
    });
  });
});
