import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findUnique: vi.fn() },
    tiebreakerQuestion: { findUnique: vi.fn() },
    game: { aggregate: vi.fn() },
    tiebreakerResponse: { upsert: vi.fn() },
  },
}));

import { POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindUnique = prisma.slate.findUnique as ReturnType<typeof vi.fn>;
const mockQuestionFindUnique = prisma.tiebreakerQuestion.findUnique as ReturnType<typeof vi.fn>;
const mockGameAggregate = prisma.game.aggregate as ReturnType<typeof vi.fn>;
const mockResponseUpsert = prisma.tiebreakerResponse.upsert as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const slateId = "slate-1";
const questionId = "q-1";

const fakeContext = { params: Promise.resolve({ leagueId, slateId, questionId }) };
const memberMembership = { id: "mem-1", userId: "user-1", leagueId, role: "member" };
const fakeSlate = { id: slateId, leagueId, name: "Week 1", status: "active" };
const fakeQuestion = { id: questionId, slateId, question: "Total score?", position: 1, answer: null };

// A future start time so the lock hasn't passed
const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

function makeRequest(body: unknown) {
  return new Request(
    `http://localhost/api/leagues/${leagueId}/slates/${slateId}/tiebreakers/${questionId}/responses`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

function setupOpen() {
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
  mockMemberFindUnique.mockResolvedValue(memberMembership);
  mockSlateFindUnique.mockResolvedValue(fakeSlate);
  mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
  // Lock deadline is 30 min before futureTime, which is still in the future
  mockGameAggregate.mockResolvedValue({ _min: { startTime: futureTime } });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST .../tiebreakers/[questionId]/responses", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    expect(res.status).toBe(403);
  });

  it("returns 404 when slate not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Slate not found");
  });

  it("returns 404 when question not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Question not found");
  });

  it("returns 400 when response is not an integer", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
    const res = await POST(makeRequest({ response: "not-a-number" }), fakeContext);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("response must be an integer");
  });

  it("returns 400 when past lock deadline", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
    // First game started 2 hours ago — deadline was 2h30m ago
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mockGameAggregate.mockResolvedValue({ _min: { startTime: pastTime } });
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Response deadline has passed");
  });

  it("upserts and returns the response", async () => {
    setupOpen();
    mockResponseUpsert.mockResolvedValue({ id: "resp-1", userId: "user-1", questionId, response: 45 });
    const res = await POST(makeRequest({ response: 45 }), fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.response).toBe(45);
    expect(mockResponseUpsert).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: "user-1", questionId } },
      create: { userId: "user-1", questionId, response: 45 },
      update: { response: 45 },
    });
  });

  it("allows submission when slate has no games (no lock deadline)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
    mockGameAggregate.mockResolvedValue({ _min: { startTime: null } }); // no games
    mockResponseUpsert.mockResolvedValue({ id: "resp-1", userId: "user-1", questionId, response: 10 });
    const res = await POST(makeRequest({ response: 10 }), fakeContext);
    expect(res.status).toBe(200);
  });
});
