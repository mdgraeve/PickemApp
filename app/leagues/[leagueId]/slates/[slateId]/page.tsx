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

type TiebreakerMemberResponse = {
  userId: string;
  name: string;
  response: number;
};

type TiebreakerQuestion = {
  id: string;
  question: string;
  position: number;
  answer: number | null;
  myResponse: number | null;
  responses: TiebreakerMemberResponse[];
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
  const [tiebreakers, setTiebreakers] = useState<TiebreakerQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      fetch(`/api/leagues/${leagueId}/slates/${slateId}/games`),
      fetch(`/api/leagues/${leagueId}/slates/${slateId}/tiebreakers`),
    ])
      .then(async ([gamesRes, tbRes]) => {
        if (!gamesRes.ok) {
          const d = await gamesRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${gamesRes.status}`);
        }
        const gamesData = await gamesRes.json();
        const tbData: TiebreakerQuestion[] = tbRes.ok ? await tbRes.json() : [];
        return { gamesData, tbData };
      })
      .then(({ gamesData, tbData }) => {
        setSlate(gamesData.slate);
        setGames(gamesData.games);
        setTiebreakers(tbData);
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

      {tiebreakers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">Tie-breaker</h2>
          <ul className="space-y-3">
            {tiebreakers.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-zinc-200 px-5 py-4 space-y-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium">{q.question}</p>
                  {q.answer !== null && (
                    <span className="shrink-0 rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                      Answer: {q.answer}
                    </span>
                  )}
                </div>
                {q.responses.length > 0 ? (
                  <ul className="space-y-1">
                    {q.responses.map((r) => {
                      const isOver = q.answer !== null && r.response > q.answer;
                      const isExact = q.answer !== null && r.response === q.answer;
                      return (
                        <li
                          key={r.userId}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-zinc-600 dark:text-zinc-400">{r.name}</span>
                          <span className={`font-medium ${isExact ? "text-green-600 dark:text-green-400" : isOver ? "text-red-500" : ""}`}>
                            {r.response}
                            {isOver && <span className="ml-1 text-xs font-normal text-red-400">(over)</span>}
                            {isExact && <span className="ml-1 text-xs font-normal text-green-500">(exact!)</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-400">No responses submitted.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
