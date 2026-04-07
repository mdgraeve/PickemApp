import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leagueId: string; userId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, userId: targetUserId } = await params;
  const requesterId = session.user.id;

  const requesterMembership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: requesterId, leagueId } },
  });

  if (!requesterMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (requesterMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can change member roles" },
      { status: 403 },
    );
  }

  const targetMembership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: targetUserId, leagueId } },
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = (body as Record<string, unknown>)?.role;
  if (role !== "admin" && role !== "member") {
    return NextResponse.json(
      { error: "role must be 'admin' or 'member'" },
      { status: 400 },
    );
  }

  // Guard: prevent demoting the sole admin.
  if (targetMembership.role === "admin" && role === "member") {
    const adminCount = await prisma.leagueMember.count({
      where: { leagueId, role: "admin" },
    });
    if (adminCount === 1) {
      return NextResponse.json(
        { error: "Cannot demote the only admin of a league" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.leagueMember.update({
    where: { userId_leagueId: { userId: targetUserId, leagueId } },
    data: { role },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string; userId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leagueId, userId: targetUserId } = await params;
  const requesterId = session.user.id;

  const requesterMembership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: requesterId, leagueId } },
  });

  if (!requesterMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (requesterMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only league admins can remove members" },
      { status: 403 },
    );
  }

  const targetMembership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: targetUserId, leagueId } },
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Guard: prevent removing the sole admin.
  if (targetMembership.role === "admin") {
    const adminCount = await prisma.leagueMember.count({
      where: { leagueId, role: "admin" },
    });
    if (adminCount === 1) {
      return NextResponse.json(
        { error: "Cannot remove the only admin of a league" },
        { status: 400 },
      );
    }
  }

  await prisma.leagueMember.delete({
    where: { userId_leagueId: { userId: targetUserId, leagueId } },
  });

  return NextResponse.json({ success: true });
}
