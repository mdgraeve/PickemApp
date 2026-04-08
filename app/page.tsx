"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { PageLoader, SkeletonCard } from "@/app/components/skeleton";

type League = {
  id: string;
  name: string;
  sport: string | null;
  inviteCode: string;
  memberCount: number;
  role: string;
};

export default function Home() {
  const { data: session, status } = useSession();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoadingLeagues(true);
    fetch("/api/leagues")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: League[]) => setLeagues(data))
      .catch(() => {})
      .finally(() => setLoadingLeagues(false));
  }, [status]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? "Something went wrong");
        return;
      }
      setJoinCode("");
      setShowJoin(false);
      setLeagues((prev) => [
        ...prev,
        { ...data, memberCount: 1, role: "member" },
      ]);
    } catch {
      setJoinError("Something went wrong");
    } finally {
      setJoining(false);
    }
  }

  if (status === "loading") return <PageLoader />;

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="text-center space-y-6 px-4">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight text-white">LockHub</h1>
            <p className="text-slate-400 text-lg">Lock In. Win Big. Repeat.</p>
          </div>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Your Leagues</h1>
      </div>

      {loadingLeagues ? (
        <div className="space-y-3">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
      ) : leagues.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center space-y-4">
          <p className="text-base font-semibold text-white">No leagues yet</p>
          <p className="text-sm text-slate-400">Create a new league or join one with an invite code.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href="/leagues/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Create League
            </Link>
            <button
              onClick={() => setShowJoin(true)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Join with Code
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 transition hover:border-slate-700 hover:bg-slate-800/60"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-white truncate">{league.name}</p>
                  <p className="text-sm text-slate-400">
                    {league.memberCount} member{league.memberCount !== 1 ? "s" : ""}
                    {league.role === "admin" && (
                      <span className="ml-2 rounded-full bg-blue-900/50 px-2 py-0.5 text-xs font-medium text-blue-300">
                        admin
                      </span>
                    )}
                  </p>
                </div>
                {league.sport && (
                  <span className="ml-4 shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
                    {league.sport}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {leagues.length > 0 && (
        <div className="flex gap-3">
          <Link
            href="/leagues/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Create league
          </Link>
          <button
            onClick={() => setShowJoin((v) => !v)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Join with invite code
          </button>
        </div>
      )}

      {showJoin && (
        <form onSubmit={handleJoin} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {joinError && <p className="text-sm text-red-400">{joinError}</p>}
          </div>
          <button
            type="submit"
            disabled={joining}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </form>
      )}
    </div>
  );
}
