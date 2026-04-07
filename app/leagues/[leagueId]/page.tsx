"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type League = {
  id: string;
  name: string;
  sport: string | null;
  role: string;
  memberCount: number;
  inviteCode: string;
};

type Slate = {
  id: string;
  name: string;
  position: number;
  status: string;
  lockDeadline: string | null;
};

type SlateListItem = {
  id: string;
  name: string;
  position: number;
  status: string;
  gameCount: number;
};

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  myPick: string | null;
};

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "";
  const d = new Date(deadline);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatGameTime(startTime: string): string {
  const d = new Date(startTime);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function isPastDeadline(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) <= new Date();
}

function getWinner(game: Game): string | null {
  if (game.homeScore === null || game.awayScore === null) return null;
  if (game.homeScore > game.awayScore) return game.homeTeam;
  if (game.awayScore > game.homeScore) return game.awayTeam;
  return null; // tie
}

export default function LeaguePage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [slate, setSlate] = useState<Slate | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [pastSlates, setPastSlates] = useState<SlateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickSubmitting, setPickSubmitting] = useState<string | null>(null); // gameId being submitted

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      fetch(`/api/leagues/${leagueId}`),
      fetch(`/api/leagues/${leagueId}/games`),
      fetch(`/api/leagues/${leagueId}/slates`),
    ])
      .then(async ([leagueRes, gamesRes, slatesRes]) => {
        if (!leagueRes.ok) {
          const d = await leagueRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${leagueRes.status}`);
        }
        if (!gamesRes.ok) {
          const d = await gamesRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${gamesRes.status}`);
        }
        return Promise.all([leagueRes.json(), gamesRes.json(), slatesRes.ok ? slatesRes.json() : []]);
      })
      .then(([leagueData, gamesData, slatesData]) => {
        setLeague(leagueData);
        setSlate(gamesData.slate);
        setGames(gamesData.games);
        setPastSlates((slatesData as SlateListItem[]).filter((s) => s.status === "completed"));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, status, router]);

  async function submitPick(gameId: string, pickedTeam: string) {
    setPickSubmitting(gameId);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/games/${gameId}/picks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pickedTeam }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to submit pick");
        return;
      }
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, myPick: pickedTeam } : g)),
      );
    } catch {
      alert("Failed to submit pick");
    } finally {
      setPickSubmitting(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  const locked = isPastDeadline(slate?.lockDeadline ?? null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              ← Home
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{league?.name}</h1>
            {league?.sport && (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {league.sport}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/leagues/${leagueId}/leaderboard`}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Leaderboard
            </Link>
            {league?.role === "admin" && (
              <Link
                href={`/leagues/${leagueId}/admin`}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Active slate */}
      {!slate ? (
        <div className="rounded-xl border border-zinc-200 px-5 py-8 text-center dark:border-zinc-800">
          <p className="text-zinc-500">No active slate right now.</p>
          {league?.role === "admin" && (
            <Link
              href={`/leagues/${leagueId}/admin`}
              className="mt-3 inline-block text-sm text-zinc-700 underline dark:text-zinc-300"
            >
              Set up a slate in Admin
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{slate.name}</h2>
            {slate.lockDeadline && (
              <p className={`text-sm ${locked ? "text-red-500" : "text-zinc-500"}`}>
                {locked ? "Picks locked" : `Lock: ${formatDeadline(slate.lockDeadline)}`}
              </p>
            )}
          </div>

          {games.length === 0 ? (
            <p className="text-zinc-500">No games in this slate yet.</p>
          ) : (
            <ul className="space-y-3">
              {games.map((game) => {
                const winner = getWinner(game);
                const isCompleted = game.status === "completed";
                const isSubmitting = pickSubmitting === game.id;

                return (
                  <li
                    key={game.id}
                    className="rounded-xl border border-zinc-200 px-5 py-4 space-y-3 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between text-sm text-zinc-500">
                      <span>{formatGameTime(game.startTime)}</span>
                      {isCompleted && (
                        <span className="text-xs font-medium text-zinc-400">Final</span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      {[game.awayTeam, game.homeTeam].map((team) => {
                        const isPicked = game.myPick === team;
                        const isWinner = winner === team;
                        const isLoser = isCompleted && winner !== null && winner !== team;
                        const isCorrect = isCompleted && isPicked && isWinner;
                        const isWrong = isCompleted && isPicked && !isWinner;

                        let cls =
                          "flex-1 rounded-lg px-3 py-2 text-sm font-medium text-center transition-colors";

                        if (isCorrect) {
                          cls += " bg-green-100 border border-green-400 text-green-800 dark:bg-green-900/30 dark:text-green-300";
                        } else if (isWrong) {
                          cls += " bg-red-100 border border-red-400 text-red-800 dark:bg-red-900/30 dark:text-red-300";
                        } else if (isPicked) {
                          cls += " bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
                        } else if (isLoser) {
                          cls += " border border-zinc-200 text-zinc-400 dark:border-zinc-700";
                        } else {
                          cls += " border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
                        }

                        if (locked || isCompleted || isSubmitting) {
                          cls += " cursor-default";
                        }

                        return (
                          <button
                            key={team}
                            disabled={locked || isCompleted || isSubmitting}
                            onClick={() => submitPick(game.id, team)}
                            className={cls}
                          >
                            {team}
                            {isCompleted && game.homeScore !== null && game.awayScore !== null && (
                              <span className="ml-1 text-xs font-normal">
                                ({team === game.homeTeam ? game.homeScore : game.awayScore})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Past slates */}
      {pastSlates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">Past Slates</h2>
          <ul className="space-y-2">
            {pastSlates.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/leagues/${leagueId}/slates/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 transition-colors dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-zinc-400">{s.gameCount} game{s.gameCount !== 1 ? "s" : ""} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
