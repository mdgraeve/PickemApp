"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

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

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">LockHub</h1>
          <p className="text-zinc-500">Lock In. Win Big. Repeat.</p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Your Leagues</h1>
        <button
          onClick={() => signOut()}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>

      {loadingLeagues ? (
        <p className="text-zinc-500">Loading leagues...</p>
      ) : leagues.length === 0 ? (
        <p className="text-zinc-500">
          You haven&apos;t joined any leagues yet. Create one or join with an invite code.
        </p>
      ) : (
        <ul className="space-y-3">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 px-5 py-4 hover:bg-zinc-50 transition-colors dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">{league.name}</p>
                  <p className="text-sm text-zinc-500">
                    {league.memberCount} member{league.memberCount !== 1 ? "s" : ""}
                    {league.role === "admin" && (
                      <span className="ml-2 text-xs text-zinc-400">admin</span>
                    )}
                  </p>
                </div>
                {league.sport && (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {league.sport}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <Link
          href="/leagues/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create league
        </Link>
        <button
          onClick={() => setShowJoin((v) => !v)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Join with invite code
        </button>
      </div>

      {showJoin && (
        <form onSubmit={handleJoin} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
            />
            {joinError && <p className="text-sm text-red-500">{joinError}</p>}
          </div>
          <button
            type="submit"
            disabled={joining}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </form>
      )}
    </div>
  );
}
