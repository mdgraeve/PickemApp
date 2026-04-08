import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; slateId: string; questionId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, slateId, questionId } = await params;
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

  const question = await prisma.tiebreakerQuestion.findUnique({ where: { id: questionId } });
  if (!question || question.slateId !== slateId) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const response = (body as Record<string, unknown>)?.response;
  if (typeof response !== "number" || !Number.isInteger(response)) {
    return NextResponse.json({ error: "response must be an integer" }, { status: 400 });
  }

  // Lock deadline: 30 min before the earliest game in the slate
  const agg = await prisma.game.aggregate({
    where: { slateId },
    _min: { startTime: true },
  });
  if (agg._min.startTime) {
    const lockDeadline = new Date(agg._min.startTime.getTime() - 30 * 60 * 1000);
    if (lockDeadline <= new Date()) {
      return NextResponse.json({ error: "Response deadline has passed" }, { status: 400 });
    }
  }

  const saved = await prisma.tiebreakerResponse.upsert({
    where: { userId_questionId: { userId, questionId } },
    create: { userId, questionId, response },
    update: { response },
  });

  return NextResponse.json(saved, { status: 200 });
}
