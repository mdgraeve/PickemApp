"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { PageLoader } from "@/app/components/skeleton";
import { getTeamLogoUrl } from "@/lib/team-logos";
import { PodiumDisplay, type PodiumEntry } from "@/app/components/podium";

type League = {
  id: string;
  name: string;
  sport: string | null;
  role: string;
  memberCount: number;
  inviteCode: string;
};

type SlateListItem = {
  id: string;
  name: string;
  position: number;
  status: string;
  gameCount: number;
};

type Slate = {
  id: string;
  name: string;
  position: number;
  status: string;
  lockDeadline: string | null;
};

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  espnGameId: string | null;
  myPick: string | null;
};

type TiebreakerQuestion = {
  id: string;
  question: string;
  position: number;
  myResponse: number | null;
};

type LiveScore = {
  homeScore: number | null;
  awayScore: number | null;
  clock: string | null;
  period: number | null;
  shortDetail: string | null;
  status: string;
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
  return null;
}

export default function LeaguePage() {
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [allSlates, setAllSlates] = useState<SlateListItem[]>([]);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const [slateInfo, setSlateInfo] = useState<Slate | null>(null);
  const [slateGames, setSlateGames] = useState<Game[]>([]);
  const [slateLoading, setSlateLoading] = useState(false);

  const [tiebreakers, setTiebreakers] = useState<TiebreakerQuestion[]>([]);
  const [tbInputs, setTbInputs] = useState<Record<string, string>>({});
  const [tbSubmitting, setTbSubmitting] = useState<string | null>(null);
  const [tbErrors, setTbErrors] = useState<Record<string, string>>({});

  const [leaderboard, setLeaderboard] = useState<PodiumEntry[]>([]);
  const [liveScores, setLiveScores] = useState<Record<string, LiveScore>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickSubmitting, setPickSubmitting] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Initial load: league, slates list, leaderboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      fetch(`/api/leagues/${leagueId}`),
      fetch(`/api/leagues/${leagueId}/slates`),
      fetch(`/api/leagues/${leagueId}/leaderboard`),
    ])
      .then(async ([leagueRes, slatesRes, lbRes]) => {
        if (!leagueRes.ok) {
          const d = await leagueRes.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${leagueRes.status}`);
        }
        return Promise.all([
          leagueRes.json(),
          slatesRes.ok ? slatesRes.json() : [],
          lbRes.ok ? lbRes.json() : [],
        ]);
      })
      .then(([leagueData, slatesData, lbData]) => {
        setLeague(leagueData);
        setLeaderboard((lbData as PodiumEntry[]).slice(0, 3));

        const slates: SlateListItem[] = slatesData;
        setAllSlates(slates);

        // Default to the active slate; fall back to first slate.
        const activeIdx = slates.findIndex((s) => s.status === "active");
        setViewIndex(activeIdx !== -1 ? activeIdx : slates.length > 0 ? 0 : null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, status, router]);

  // ---------------------------------------------------------------------------
  // Fetch games + tiebreakers when the viewed slate changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewIndex === null || viewIndex >= allSlates.length) {
      setSlateInfo(null);
      setSlateGames([]);
      setTiebreakers([]);
      setTbInputs({});
      setLiveScores({});
      return;
    }

    const slate = allSlates[viewIndex];
    setSlateLoading(true);
    setSlateGames([]);
    setSlateInfo(null);
    setTiebreakers([]);
    setTbInputs({});
    setLiveScores({});

    Promise.all([
      fetch(`/api/leagues/${leagueId}/slates/${slate.id}/games`),
      fetch(`/api/leagues/${leagueId}/slates/${slate.id}/tiebreakers`).catch(() => null),
    ])
      .then(async ([gamesRes, tbRes]) => {
        if (!gamesRes.ok) return;
        const gamesData = await gamesRes.json();
        setSlateInfo(gamesData.slate);
        setSlateGames(gamesData.games);

        if (tbRes?.ok) {
          const tbData: TiebreakerQuestion[] = await tbRes.json();
          setTiebreakers(tbData);
          const initial: Record<string, string> = {};
          for (const q of tbData) {
            if (q.myResponse !== null) initial[q.id] = String(q.myResponse);
          }
          setTbInputs(initial);
        }
      })
      .finally(() => setSlateLoading(false));
  }, [viewIndex, allSlates, leagueId]);

  // ---------------------------------------------------------------------------
  // Live score polling (active slate only, every 45s)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (slateInfo?.status !== "active") return;
    const hasLiveGames = slateGames.some((g) => g.espnGameId && g.status !== "completed");
    if (!hasLiveGames) return;

    async function fetchLiveScores() {
      try {
        const res = await fetch(`/api/leagues/${leagueId}/games/live`);
        if (res.ok) setLiveScores(await res.json());
      } catch {
        // Silent fail — retain last known state
      }
    }

    void fetchLiveScores();
    const id = setInterval(fetchLiveScores, 45_000);
    return () => clearInterval(id);
  }, [slateGames, slateInfo, leagueId]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function submitPick(gameId: string, pickedTeam: string) {
    setPickSubmitting(gameId);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickedTeam }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to submit pick");
        return;
      }
      setSlateGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, myPick: pickedTeam } : g)),
      );
    } catch {
      alert("Failed to submit pick");
    } finally {
      setPickSubmitting(null);
    }
  }

  async function submitTiebreaker(questionId: string) {
    const raw = tbInputs[questionId];
    const value = parseInt(raw, 10);
    if (isNaN(value)) {
      setTbErrors((prev) => ({ ...prev, [questionId]: "Please enter a whole number" }));
      return;
    }
    setTbSubmitting(questionId);
    setTbErrors((prev) => ({ ...prev, [questionId]: "" }));
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/slates/${slateInfo!.id}/tiebreakers/${questionId}/responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response: value }),
        },
      );
      const d = await res.json();
      if (!res.ok) {
        setTbErrors((prev) => ({ ...prev, [questionId]: d.error ?? "Failed to save" }));
        return;
      }
      setTiebreakers((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, myResponse: value } : q)),
      );
    } catch {
      setTbErrors((prev) => ({ ...prev, [questionId]: "Failed to save" }));
    } finally {
      setTbSubmitting(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (status === "loading" || loading) return <PageLoader />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const locked = isPastDeadline(slateInfo?.lockDeadline ?? null);
  const isNoUpcomingView = viewIndex !== null && viewIndex >= allSlates.length;
  const currentSlateItem = viewIndex !== null && viewIndex < allSlates.length
    ? allSlates[viewIndex]
    : null;

  const statusLabel: Record<string, string> = {
    active: "Active",
    completed: "Final",
    upcoming: "Upcoming",
  };
  const statusColor: Record<string, string> = {
    active: "text-blue-400",
    completed: "text-slate-500",
    upcoming: "text-amber-400",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Podium leaderboard summary */}
      {leaderboard.length > 0 && (
        <PodiumDisplay entries={leaderboard} leagueId={leagueId} />
      )}

      {/* No slates at all */}
      {allSlates.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center space-y-3">
          <p className="text-base font-semibold text-white">No slates yet</p>
          <p className="text-sm text-slate-400">
            Check back soon — games will appear here when a slate is ready.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Slate navigation header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewIndex((v) => Math.max(0, (v ?? 1) - 1))}
              disabled={viewIndex === null || viewIndex === 0}
              aria-label="Previous slate"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:cursor-default transition"
            >
              ‹
            </button>

            <div className="flex-1 min-w-0 text-center">
              {currentSlateItem ? (
                <>
                  <h1 className="text-2xl font-bold tracking-tight text-white truncate">
                    {currentSlateItem.name}
                  </h1>
                  <span className={`text-xs font-medium ${statusColor[currentSlateItem.status] ?? "text-slate-400"}`}>
                    {statusLabel[currentSlateItem.status] ?? currentSlateItem.status}
                  </span>
                </>
              ) : isNoUpcomingView ? (
                <h1 className="text-xl font-semibold text-slate-400">No Upcoming Slate</h1>
              ) : null}
            </div>

            <button
              onClick={() => setViewIndex((v) => Math.min(allSlates.length, (v ?? 0) + 1))}
              disabled={viewIndex === null || viewIndex >= allSlates.length}
              aria-label="Next slate"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:cursor-default transition"
            >
              ›
            </button>
          </div>

          {/* No upcoming slate empty state */}
          {isNoUpcomingView ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center space-y-2">
              <p className="text-base font-semibold text-white">No Upcoming Slate</p>
              <p className="text-sm text-slate-400">Check back later — new slates will appear here when they&apos;re created.</p>
            </div>
          ) : slateLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3 animate-pulse">
                  <div className="h-3 w-40 rounded bg-slate-800" />
                  <div className="flex gap-3">
                    <div className="h-11 flex-1 rounded-xl bg-slate-800" />
                    <div className="h-11 flex-1 rounded-xl bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Lock deadline */}
              {slateInfo?.lockDeadline && (
                <p className={`text-sm ${locked ? "text-red-400 font-medium" : "text-slate-400"}`}>
                  {locked ? "Picks locked" : `Locks ${formatDeadline(slateInfo.lockDeadline)}`}
                </p>
              )}

              {/* Games */}
              {slateGames.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center">
                  <p className="text-slate-400">No games in this slate yet.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {slateGames.map((game) => {
                    const winner = getWinner(game);
                    const isCompleted = game.status === "completed";
                    const isSubmitting = pickSubmitting === game.id;
                    const liveScore = liveScores[game.id];
                    const isLive = liveScore?.status === "in_progress";

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
                          {isLive && (
                            <span className="flex items-center gap-1.5 font-medium text-red-400">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                              </span>
                              LIVE
                              {liveScore.shortDetail && (
                                <span className="font-normal text-slate-300">{liveScore.shortDetail}</span>
                              )}
                              {liveScore.homeScore !== null && liveScore.awayScore !== null && (
                                <span className="font-semibold text-white">
                                  {liveScore.awayScore}–{liveScore.homeScore}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-3">
                          {[game.awayTeam, game.homeTeam].map((team) => {
                            const isPicked = game.myPick === team;
                            const isWinner = winner === team;
                            const isLoser = isCompleted && winner !== null && winner !== team;
                            const isCorrect = isCompleted && isPicked && isWinner;
                            const isWrong = isCompleted && isPicked && !isWinner;
                            const logoUrl = league?.sport
                              ? getTeamLogoUrl(league.sport, team)
                              : null;

                            let cls =
                              "flex-1 rounded-xl px-3 py-4 text-sm font-semibold text-center transition-colors";

                            if (isCorrect) {
                              cls += " bg-green-900/40 border border-green-600/60 text-green-300";
                            } else if (isWrong) {
                              cls += " bg-red-900/40 border border-red-600/60 text-red-300";
                            } else if (isPicked) {
                              cls += " bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900";
                            } else if (isLoser) {
                              cls += " border border-slate-800 text-slate-600";
                            } else {
                              cls += " border border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800/60";
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
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Tiebreaker questions */}
              {tiebreakers.length > 0 && slateInfo && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-white">Tie-breaker</h2>
                  <ul className="space-y-3">
                    {tiebreakers.map((q) => {
                      const isSubmitting = tbSubmitting === q.id;
                      const err = tbErrors[q.id];
                      const currentVal = tbInputs[q.id] ?? "";
                      const savedVal = q.myResponse !== null ? String(q.myResponse) : "";
                      const isDirty = currentVal !== savedVal;
                      return (
                        <li
                          key={q.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3"
                        >
                          <p className="text-sm font-medium text-white">{q.question}</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="1"
                              value={currentVal}
                              onChange={(e) => {
                                setTbInputs((prev) => ({ ...prev, [q.id]: e.target.value }));
                                setTbErrors((prev) => ({ ...prev, [q.id]: "" }));
                              }}
                              disabled={locked || isSubmitting}
                              placeholder="Your answer"
                              className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <button
                              onClick={() => submitTiebreaker(q.id)}
                              disabled={locked || isSubmitting || !currentVal || !isDirty}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
                            >
                              {isSubmitting ? "Saving..." : q.myResponse !== null ? "Update" : "Submit"}
                            </button>
                            {q.myResponse !== null && !isDirty && (
                              <span className="text-xs text-slate-400">Saved: {q.myResponse}</span>
                            )}
                          </div>
                          {err && <p className="text-xs text-red-400">{err}</p>}
                          {locked && (
                            <p className="text-xs text-slate-500">Responses are locked.</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
