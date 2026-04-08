"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { PageLoader } from "@/app/components/skeleton";

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"] as const;

type League = {
  id: string;
  name: string;
  sport: string | null;
  role: string;
  memberCount: number;
  inviteCode: string;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  name: string | null;
  email: string;
};

export default function LeagueSettingsPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [hasSlates, setHasSlates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [newSport, setNewSport] = useState("");
  const [sportSubmitting, setSportSubmitting] = useState(false);
  const [sportError, setSportError] = useState<string | null>(null);
  const [sportSuccess, setSportSuccess] = useState(false);

  const [copied, setCopied] = useState(false);

  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionPending, setMemberActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      fetch(`/api/leagues/${leagueId}`),
      fetch(`/api/leagues/${leagueId}/members`),
      fetch(`/api/leagues/${leagueId}/slates`),
    ])
      .then(async ([leagueRes, membersRes, slatesRes]) => {
        if (!leagueRes.ok) {
          const d = await leagueRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${leagueRes.status}`);
        }
        const leagueData: League = await leagueRes.json();
        if (leagueData.role !== "admin") {
          router.replace(`/leagues/${leagueId}`);
          return;
        }
        const membersData: Member[] = membersRes.ok ? await membersRes.json() : [];
        const slatesData = slatesRes.ok ? await slatesRes.json() : [];
        return { leagueData, membersData, slatesData };
      })
      .then((result) => {
        if (!result) return;
        const { leagueData, membersData, slatesData } = result;
        setLeague(leagueData);
        setNewName(leagueData.name);
        setNewSport(leagueData.sport ?? "");
        setMembers(membersData);
        setHasSlates(Array.isArray(slatesData) && slatesData.length > 0);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, status, router]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setNameSubmitting(true);
    setNameError(null);
    setNameSuccess(false);
    try {
      const res = await fetch(`/api/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error ?? "Failed to rename");
        return;
      }
      setLeague((prev) => prev ? { ...prev, name: data.name } : prev);
      setNameSuccess(true);
      router.refresh();
    } catch {
      setNameError("Failed to rename");
    } finally {
      setNameSubmitting(false);
    }
  }

  async function handleSportChange(e: React.FormEvent) {
    e.preventDefault();
    setSportSubmitting(true);
    setSportError(null);
    setSportSuccess(false);
    try {
      const res = await fetch(`/api/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: newSport }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSportError(data.error ?? "Failed to update sport");
        return;
      }
      setLeague((prev) => prev ? { ...prev, sport: data.sport } : prev);
      setSportSuccess(true);
      router.refresh();
    } catch {
      setSportError("Failed to update sport");
    } finally {
      setSportSubmitting(false);
    }
  }

  async function copyInviteCode() {
    if (!league) return;
    await navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRoleChange(userId: string, newRole: "admin" | "member") {
    setMemberActionPending(userId);
    setMemberActionError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberActionError(data.error ?? "Failed to change role");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: data.role } : m)),
      );
    } catch {
      setMemberActionError("Failed to change role");
    } finally {
      setMemberActionPending(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from the league?")) return;
    setMemberActionPending(userId);
    setMemberActionError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/members/${userId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberActionError(data.error ?? "Failed to remove member");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      setMemberActionError("Failed to remove member");
    } finally {
      setMemberActionPending(null);
    }
  }

  if (status === "loading" || loading) return <PageLoader />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-10">
      <h1 className="text-3xl font-bold tracking-tight text-white">League Settings</h1>

      {/* Rename */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-white">League Name</h2>
        <form onSubmit={handleRename} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNameSuccess(false); }}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="League name"
            required
          />
          <button
            type="submit"
            disabled={nameSubmitting || newName.trim() === league?.name}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {nameSubmitting ? "Saving..." : "Rename"}
          </button>
        </form>
        {nameError && <p className="text-sm text-red-400">{nameError}</p>}
        {nameSuccess && <p className="text-sm text-green-400">League renamed.</p>}
      </section>

      {/* Sport */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-white">Sport</h2>
        {hasSlates ? (
          <p className="text-sm text-slate-400">
            Sport cannot be changed after slates have been created.
            Current sport:{" "}
            <span className="font-medium text-white">{league?.sport}</span>
          </p>
        ) : (
          <form onSubmit={handleSportChange} className="flex gap-2">
            <select
              value={newSport}
              onChange={(e) => { setNewSport(e.target.value); setSportSuccess(false); }}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>Select sport</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={sportSubmitting || newSport === league?.sport || !newSport}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              {sportSubmitting ? "Saving..." : "Update"}
            </button>
          </form>
        )}
        {sportError && <p className="text-sm text-red-400">{sportError}</p>}
        {sportSuccess && <p className="text-sm text-green-400">Sport updated.</p>}
      </section>

      {/* Invite Code */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-white">Invite Code</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-mono text-slate-300 tracking-wider">
            {league?.inviteCode}
          </code>
          <button
            onClick={copyInviteCode}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-slate-500">Share this code with people you want to invite to the league.</p>
      </section>

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-white">Members ({members.length})</h2>
        {memberActionError && (
          <p className="text-sm text-red-400">{memberActionError}</p>
        )}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden divide-y divide-slate-800">
          {members.map((member) => {
            const isCurrentUser = member.userId === currentUserId;
            const isPending = memberActionPending === member.userId;
            return (
              <div key={member.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {member.name ?? member.email}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-slate-500">(you)</span>
                    )}
                  </p>
                  {member.name && (
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                  )}
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      member.role === "admin"
                        ? "bg-blue-900/50 text-blue-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {member.role}
                  </span>
                  {!isCurrentUser && (
                    <>
                      <button
                        disabled={isPending}
                        onClick={() =>
                          handleRoleChange(
                            member.userId,
                            member.role === "admin" ? "member" : "admin",
                          )
                        }
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-40"
                      >
                        {isPending ? "..." : member.role === "admin" ? "Demote" : "Promote"}
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => handleRemoveMember(member.userId)}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-950/30 transition disabled:opacity-40"
                      >
                        {isPending ? "..." : "Remove"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
