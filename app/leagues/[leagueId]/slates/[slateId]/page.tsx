"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Slate = {
  id: string;
  name: string;
  position: number;
  status: string;
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

function formatGameTime(startTime: string): string {
  return new Date(startTime).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function getWinner(game: Game): string | null {
  if (game.homeScore === null || game.awayScore === null) return null;
  if (game.homeScore > game.awayScore) return game.homeTeam;
  if (game.awayScore > game.homeScore) return game.awayTeam;
  return null;
}

export default function SlateHistoryPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const slateId = params.slateId as string;

  const [slate, setSlate] = useState<Slate | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    fetch(`/api/leagues/${leagueId}/slates/${slateId}/games`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setSlate(data.slate);
        setGames(data.games);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, slateId, status, router]);

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{slate?.name}</h1>
        {slate?.status && (
          <span className="text-sm text-zinc-500 capitalize">{slate.status}</span>
        )}
      </div>

      {games.length === 0 ? (
        <p className="text-zinc-500">No games in this slate.</p>
      ) : (
        <ul className="space-y-3">
          {games.map((game) => {
            const winner = getWinner(game);
            const isCompleted = game.status === "completed";

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
                      "flex-1 rounded-lg px-3 py-2 text-sm font-medium text-center cursor-default";

                    if (isCorrect) {
                      cls += " bg-green-100 border border-green-400 text-green-800 dark:bg-green-900/30 dark:text-green-300";
                    } else if (isWrong) {
                      cls += " bg-red-100 border border-red-400 text-red-800 dark:bg-red-900/30 dark:text-red-300";
                    } else if (isPicked) {
                      cls += " bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
                    } else if (isLoser) {
                      cls += " border border-zinc-200 text-zinc-400 dark:border-zinc-700";
                    } else {
                      cls += " border border-zinc-200 text-zinc-500 dark:border-zinc-700";
                    }

                    return (
                      <div key={team} className={cls}>
                        {team}
                        {isCompleted && game.homeScore !== null && game.awayScore !== null && (
                          <span className="ml-1 text-xs font-normal">
                            ({team === game.homeTeam ? game.homeScore : game.awayScore})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {game.myPick === null && (
                  <p className="text-xs text-zinc-400">No pick submitted</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
