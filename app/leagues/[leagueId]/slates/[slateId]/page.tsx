"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { PageLoader } from "@/app/components/skeleton";
import { getTeamLogoUrl } from "@/lib/team-logos";

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
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const slateId = params.slateId as string;

  const [sport, setSport] = useState<string | null>(null);
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
      fetch(`/api/leagues/${leagueId}`),
    ])
      .then(async ([gamesRes, tbRes, leagueRes]) => {
        if (!gamesRes.ok) {
          const d = await gamesRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${gamesRes.status}`);
        }
        const gamesData = await gamesRes.json();
        const tbData: TiebreakerQuestion[] = tbRes.ok ? await tbRes.json() : [];
        const leagueData = leagueRes.ok ? await leagueRes.json() : null;
        return { gamesData, tbData, leagueData };
      })
      .then(({ gamesData, tbData, leagueData }) => {
        setSlate(gamesData.slate);
        setGames(gamesData.games);
        setTiebreakers(tbData);
        setSport(leagueData?.sport ?? null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, slateId, status, router]);

  if (status === "loading" || loading) return <PageLoader />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">{slate?.name}</h1>
        {slate?.status && (
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400 capitalize">
            {slate.status}
          </span>
        )}
      </div>

      {/* Tiebreakers */}
      {tiebreakers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Tie-breaker</h2>
          <ul className="space-y-3">
            {tiebreakers.map((q) => (
              <li
                key={q.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-white">{q.question}</p>
                  {q.answer !== null && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      Answer: {q.answer}
                    </span>
                  )}
                </div>
                {q.responses.length > 0 ? (
                  <ul className="space-y-1.5">
                    {q.responses.map((r) => {
                      const isOver = q.answer !== null && r.response > q.answer;
                      const isExact = q.answer !== null && r.response === q.answer;
                      return (
                        <li
                          key={r.userId}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-slate-400">{r.name}</span>
                          <span className={`font-medium ${isExact ? "text-green-400" : isOver ? "text-red-400" : "text-white"}`}>
                            {r.response}
                            {isOver && <span className="ml-1 text-xs font-normal text-red-500">(over)</span>}
                            {isExact && <span className="ml-1 text-xs font-normal text-green-500">(exact!)</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">No responses submitted.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Games */}
      {games.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center">
          <p className="text-slate-400">No games in this slate.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {games.map((game) => {
            const winner = getWinner(game);
            const isCompleted = game.status === "completed";

            return (
              <li
                key={game.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{formatGameTime(game.startTime)}</span>
                  {isCompleted && (
                    <span className="font-medium uppercase tracking-wide">Final</span>
                  )}
                </div>

                <div className="flex gap-3">
                  {[game.awayTeam, game.homeTeam].map((team) => {
                    const isPicked = game.myPick === team;
                    const isWinner = winner === team;
                    const isLoser = isCompleted && winner !== null && winner !== team;
                    const isCorrect = isCompleted && isPicked && isWinner;
                    const isWrong = isCompleted && isPicked && !isWinner;
                    const logoUrl = sport ? getTeamLogoUrl(sport, team) : null;

                    let cls =
                      "flex-1 rounded-xl px-3 py-3 text-sm font-semibold text-center cursor-default transition-colors";

                    if (isCorrect) {
                      cls += " bg-green-900/40 border border-green-600/60 text-green-300";
                    } else if (isWrong) {
                      cls += " bg-red-900/40 border border-red-600/60 text-red-300";
                    } else if (isPicked) {
                      cls += " bg-blue-600 text-white";
                    } else if (isLoser) {
                      cls += " border border-slate-800 text-slate-600";
                    } else {
                      cls += " border border-slate-700 text-slate-300";
                    }

                    return (
                      <div key={team} className={cls}>
                        <span className="flex flex-col items-center gap-1.5">
                          {logoUrl && (
                            <Image
                              src={logoUrl}
                              alt={team}
                              width={32}
                              height={32}
                              unoptimized
                              className="object-contain"
                            />
                          )}
                          <span>
                            {team}
                            {isCompleted && game.homeScore !== null && game.awayScore !== null && (
                              <span className="ml-1.5 text-xs font-normal opacity-75">
                                ({team === game.homeTeam ? game.homeScore : game.awayScore})
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {game.myPick === null && (
                  <p className="text-xs text-slate-500">No pick submitted</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
