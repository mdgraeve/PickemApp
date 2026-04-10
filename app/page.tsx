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

const SPORT_EMOJI: Record<string, string> = {
  NFL: "🏈",
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NCAAF: "🏈",
  NCAAB: "🏀",
};

function sportEmoji(sport: string | null): string {
  return sport ? (SPORT_EMOJI[sport] ?? "🏟️") : "🏟️";
}

// Background emoji tiles for the landing hero
const BG_EMOJI = ["🏈", "🏀", "⚾", "🏒", "🏆", "📊"];

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

  // ── Unauthenticated landing page ──────────────────────────────────────────
  if (!session) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden min-h-[calc(100vh-3.5rem)]">
        {/* Decorative background emoji grid */}
        <div
          className="absolute inset-0 grid pointer-events-none select-none"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            alignContent: "center",
            gap: "1.5rem",
            padding: "2rem",
            opacity: 0.035,
          }}
        >
          {Array.from({ length: 60 }, (_, i) => (
            <span key={i} className="text-4xl text-center">
              {BG_EMOJI[i % BG_EMOJI.length]}
            </span>
          ))}
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center text-center gap-8 px-4 py-16">
          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-400">
            🏆 Sports Pick&apos;em
          </span>

          {/* Wordmark */}
          <div className="space-y-3">
            <h1 className="text-6xl sm:text-7xl font-black tracking-tight">
              <span className="text-white">Lock</span>
              <span className="text-blue-400">Hub</span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-sm mx-auto leading-relaxed">
              Make your picks. Beat your friends.{" "}
              <span className="text-slate-300 font-medium">Brag forever.</span>
            </p>
          </div>

          {/* CTA */}
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500 hover:shadow-blue-800/50"
          >
            Get Started <span aria-hidden>→</span>
          </Link>

          {/* Feature highlights */}
          <div className="flex flex-wrap justify-center gap-8 pt-2">
            {[
              { icon: "🏟️", label: "Create Leagues", sub: "Invite friends, set the sport" },
              { icon: "📅", label: "Submit Picks", sub: "Lock in before games start" },
              { icon: "📈", label: "Track Standings", sub: "Climb the leaderboard" },
            ].map(({ icon, label, sub }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 text-center w-28"
              >
                <span className="text-3xl">{icon}</span>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated dashboard ───────────────────────────────────────────────
  const firstName = session.user?.name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 px-6 py-8">
        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-8xl opacity-[0.07] pointer-events-none select-none">
          🏆
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">
          LockHub
        </p>
        <h1 className="text-3xl font-bold text-white">
          {firstName ? `Hey, ${firstName}` : "Your Dashboard"}
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          {leagues.length > 0
            ? `You${"\u2019"}re in ${leagues.length} league${leagues.length !== 1 ? "s" : ""}. Ready to lock in?`
            : "Create or join a league to get started."}
        </p>
      </div>

      {/* Leagues section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">Your Leagues</h2>
          <div className="flex gap-2">
            <Link
              href="/leagues/new"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              + New
            </Link>
            <button
              onClick={() => setShowJoin((v) => !v)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Join
            </button>
          </div>
        </div>

        {loadingLeagues ? (
          <div className="space-y-3">
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </div>
        ) : leagues.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center space-y-4">
            <p className="text-4xl">🏟️</p>
            <p className="text-base font-semibold text-white">No leagues yet</p>
            <p className="text-sm text-slate-400">
              Create a new league or join one with an invite code.
            </p>
            <div className="flex justify-center gap-3 pt-1">
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
                  className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 transition hover:border-slate-700 hover:bg-slate-800/60 group"
                >
                  {/* Sport icon */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-2xl group-hover:bg-slate-700 transition">
                    {sportEmoji(league.sport)}
                  </div>

                  {/* League info */}
                  <div className="flex-1 min-w-0">
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

                  {/* Sport badge */}
                  {league.sport && (
                    <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 group-hover:bg-slate-700 transition">
                      {league.sport}
                    </span>
                  )}

                  <span className="text-slate-600 group-hover:text-slate-400 transition">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Join form */}
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
