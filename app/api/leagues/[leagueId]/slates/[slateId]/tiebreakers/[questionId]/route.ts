import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function PATCH(
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
  if (membership.role !== "admin") {
    return NextResponse.json({ error: "Only league admins can set the answer" }, { status: 403 });
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

  const answer = (body as Record<string, unknown>)?.answer;
  if (typeof answer !== "number" || !Number.isInteger(answer)) {
    return NextResponse.json({ error: "answer must be an integer" }, { status: 400 });
  }

  const updated = await prisma.tiebreakerQuestion.update({
    where: { id: questionId },
    data: { answer },
  });

  return NextResponse.json(updated);
}
