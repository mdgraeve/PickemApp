import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slate = await prisma.slate.findUnique({ where: { id: slateId } });
  if (!slate || slate.leagueId !== leagueId) {
    return NextResponse.json({ error: "Slate not found" }, { status: 404 });
  }

  const isCompleted = slate.status === "completed";

  const questions = await prisma.tiebreakerQuestion.findMany({
    where: { slateId },
    orderBy: { position: "asc" },
    include: {
      responses: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const result = questions.map((q) => {
    const myResponseRecord = q.responses.find((r) => r.userId === userId) ?? null;

    const base = {
      id: q.id,
      slateId: q.slateId,
      question: q.question,
      position: q.position,
      myResponse: myResponseRecord?.response ?? null,
    };

    if (isCompleted) {
      return {
        ...base,
        answer: q.answer,
        responses: q.responses.map((r) => ({
          userId: r.userId,
          name: r.user.name ?? r.user.email,
          response: r.response,
        })),
      };
    }

    return base;
  });

  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId } = await params;
  const userId = session.user.id;

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (membership.role !== "admin") {
    return NextResponse.json({ error: "Only league admins can add tie-breaker questions" }, { status: 403 });
  }

  const slate = await prisma.slate.findUnique({ where: { id: slateId } });
  if (!slate || slate.leagueId !== leagueId) {
    return NextResponse.json({ error: "Slate not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = (body as Record<string, unknown>)?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // Auto-assign position: max existing + 1
  const agg = await prisma.tiebreakerQuestion.aggregate({
    where: { slateId },
    _max: { position: true },
  });
  const position = (agg._max.position ?? 0) + 1;

  const created = await prisma.tiebreakerQuestion.create({
    data: { slateId, question: question.trim(), position },
  });

  return NextResponse.json(created, { status: 201 });
}
