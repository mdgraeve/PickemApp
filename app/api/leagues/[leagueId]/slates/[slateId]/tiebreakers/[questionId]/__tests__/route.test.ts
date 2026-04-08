import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findUnique: vi.fn() },
    tiebreakerQuestion: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { PATCH } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindUnique = prisma.slate.findUnique as ReturnType<typeof vi.fn>;
const mockQuestionFindUnique = prisma.tiebreakerQuestion.findUnique as ReturnType<typeof vi.fn>;
const mockQuestionUpdate = prisma.tiebreakerQuestion.update as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const slateId = "slate-1";
const questionId = "q-1";

const fakeContext = { params: Promise.resolve({ leagueId, slateId, questionId }) };
const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };
const fakeSlate = { id: slateId, leagueId, name: "Week 1", status: "active" };
const fakeQuestion = { id: questionId, slateId, question: "Total score?", position: 1, answer: null };

function makeRequest(body: unknown) {
  return new Request(
    `http://localhost/api/leagues/${leagueId}/slates/${slateId}/tiebreakers/${questionId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/leagues/[leagueId]/slates/[slateId]/tiebreakers/[questionId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    expect(res.status).toBe(403);
  });

  it("returns 403 when not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    expect(res.status).toBe(403);
  });

  it("returns 404 when slate not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Slate not found");
  });

  it("returns 404 when question not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Question not found");
  });

  it("returns 400 when answer is not an integer", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
    const res = await PATCH(makeRequest({ answer: "not-a-number" }), fakeContext);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("answer must be an integer");
  });

  it("updates and returns the question with the answer set", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(fakeSlate);
    mockQuestionFindUnique.mockResolvedValue(fakeQuestion);
    mockQuestionUpdate.mockResolvedValue({ ...fakeQuestion, answer: 52 });
    const res = await PATCH(makeRequest({ answer: 52 }), fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.answer).toBe(52);
    expect(mockQuestionUpdate).toHaveBeenCalledWith({
      where: { id: questionId },
      data: { answer: 52 },
    });
  });
});
