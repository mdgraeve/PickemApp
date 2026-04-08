import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    leagueMember: { findUnique: vi.fn() },
    slate: { findUnique: vi.fn() },
    tiebreakerQuestion: { findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  },
}));

import { GET, POST } from "../route";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockMemberFindUnique = prisma.leagueMember.findUnique as ReturnType<typeof vi.fn>;
const mockSlateFindUnique = prisma.slate.findUnique as ReturnType<typeof vi.fn>;
const mockQuestionFindMany = prisma.tiebreakerQuestion.findMany as ReturnType<typeof vi.fn>;
const mockQuestionAggregate = prisma.tiebreakerQuestion.aggregate as ReturnType<typeof vi.fn>;
const mockQuestionCreate = prisma.tiebreakerQuestion.create as ReturnType<typeof vi.fn>;

const leagueId = "league-1";
const slateId = "slate-1";
const fakeRequest = new Request(`http://localhost/api/leagues/${leagueId}/slates/${slateId}/tiebreakers`);
const fakeContext = { params: Promise.resolve({ leagueId, slateId }) };

const adminMembership = { id: "mem-1", userId: "user-1", leagueId, role: "admin" };
const memberMembership = { id: "mem-2", userId: "user-2", leagueId, role: "member" };
const activeSlate = { id: slateId, leagueId, name: "Week 1", position: 1, status: "active" };
const completedSlate = { ...activeSlate, status: "completed" };

const fakeQuestion = {
  id: "q-1",
  slateId,
  question: "Total combined score?",
  position: 1,
  answer: null,
  responses: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/leagues/[leagueId]/slates/[slateId]/tiebreakers", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a league member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    expect(res.status).toBe(403);
  });

  it("returns 404 when slate not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(null);
    const res = await GET(fakeRequest, fakeContext);
    expect(res.status).toBe(404);
  });

  it("returns questions without answer when slate is not completed", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(activeSlate);
    mockQuestionFindMany.mockResolvedValue([{ ...fakeQuestion, responses: [] }]);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty("answer");
    expect(body[0].myResponse).toBeNull();
  });

  it("includes myResponse when user has submitted a response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    mockSlateFindUnique.mockResolvedValue(activeSlate);
    mockQuestionFindMany.mockResolvedValue([
      { ...fakeQuestion, responses: [{ userId: "user-2", response: 45 }] },
    ]);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(body[0].myResponse).toBe(45);
  });

  it("includes answer and all responses when slate is completed", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(completedSlate);
    mockQuestionFindMany.mockResolvedValue([
      {
        ...fakeQuestion,
        answer: 52,
        responses: [
          { userId: "user-1", response: 45, user: { id: "user-1", name: "Alice", email: "alice@example.com" } },
          { userId: "user-2", response: 55, user: { id: "user-2", name: null, email: "bob@example.com" } },
        ],
      },
    ]);
    const res = await GET(fakeRequest, fakeContext);
    const body = await res.json();
    expect(body[0].answer).toBe(52);
    expect(body[0].responses).toHaveLength(2);
    expect(body[0].responses[0]).toMatchObject({ userId: "user-1", name: "Alice", response: 45 });
    // null name falls back to email
    expect(body[0].responses[1]).toMatchObject({ userId: "user-2", name: "bob@example.com", response: 55 });
  });
});

// ---------------------------------------------------------------------------
// POST (create question)
// ---------------------------------------------------------------------------

function makePost(body: unknown) {
  return new Request(`http://localhost/api/leagues/${leagueId}/slates/${slateId}/tiebreakers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/leagues/[leagueId]/slates/[slateId]/tiebreakers", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePost({ question: "Q?" }), fakeContext);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-2" } });
    mockMemberFindUnique.mockResolvedValue(memberMembership);
    const res = await POST(makePost({ question: "Q?" }), fakeContext);
    expect(res.status).toBe(403);
  });

  it("returns 400 when question is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(activeSlate);
    const res = await POST(makePost({}), fakeContext);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("question is required");
  });

  it("creates a question with auto-assigned position", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(activeSlate);
    mockQuestionAggregate.mockResolvedValue({ _max: { position: 2 } });
    mockQuestionCreate.mockResolvedValue({ id: "q-2", slateId, question: "Total score?", position: 3, answer: null });
    const res = await POST(makePost({ question: "Total score?" }), fakeContext);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.position).toBe(3);
    expect(mockQuestionCreate).toHaveBeenCalledWith({
      data: { slateId, question: "Total score?", position: 3 },
    });
  });

  it("assigns position 1 when no questions exist yet", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemberFindUnique.mockResolvedValue(adminMembership);
    mockSlateFindUnique.mockResolvedValue(activeSlate);
    mockQuestionAggregate.mockResolvedValue({ _max: { position: null } });
    mockQuestionCreate.mockResolvedValue({ id: "q-1", slateId, question: "Q?", position: 1, answer: null });
    const res = await POST(makePost({ question: "Q?" }), fakeContext);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.position).toBe(1);
  });
});
