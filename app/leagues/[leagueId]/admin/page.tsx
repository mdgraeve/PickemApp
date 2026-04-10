"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { PageLoader } from "@/app/components/skeleton";

type League = { id: string; name: string; sport: string | null; role: string };
type Slate = { id: string; name: string; position: number; status: string; gameCount: number };
type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};
type SportGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  season: string;
};
type TiebreakerQuestion = {
  id: string;
  question: string;
  position: number;
  answer: number | null;
};

const STATUS_BADGE: Record<string, string> = {
  upcoming: "bg-slate-800 text-slate-400",
  active: "bg-blue-900/50 text-blue-300",
  completed: "bg-green-900/40 text-green-400",
};

function formatDateTime(dt: string): string {
  return new Date(dt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function AdminPage() {
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [slates, setSlates] = useState<Slate[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create slate form
  const [newSlateName, setNewSlateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Expanded slate: games + score entry
  const [expandedSlateId, setExpandedSlateId] = useState<string | null>(null);
  const [slateGames, setSlateGames] = useState<Record<string, Game[]>>({});
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});
  const [savingScore, setSavingScore] = useState<string | null>(null);

  // Tiebreaker state
  const [slateQuestions, setSlateQuestions] = useState<Record<string, TiebreakerQuestion[]>>({});
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [addingQuestion, setAddingQuestion] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<Record<string, string>>({});
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [savingAnswer, setSavingAnswer] = useState<string | null>(null);

  // Add games panel
  const [addGamesSlateId, setAddGamesSlateId] = useState<string | null>(null);
  const [espnDate, setEspnDate] = useState("");
  const [sportGames, setSportGames] = useState<SportGame[]>([]);
  const [selectedSportGameIds, setSelectedSportGameIds] = useState<Set<string>>(new Set());
  const [syncingEspn, setSyncingEspn] = useState(false);
  const [syncEspnResult, setSyncEspnResult] = useState<string | null>(null);
  const [addingGames, setAddingGames] = useState(false);
  const [addGamesError, setAddGamesError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      fetch(`/api/leagues/${leagueId}`),
      fetch(`/api/leagues/${leagueId}/slates`),
    ])
      .then(async ([lRes, sRes]) => {
        if (!lRes.ok) throw new Error("Failed to load league");
        if (!sRes.ok) throw new Error("Failed to load slates");
        return Promise.all([lRes.json(), sRes.json()]);
      })
      .then(([lData, sData]) => {
        if (lData.role !== "admin") {
          router.push(`/leagues/${leagueId}`);
          return;
        }
        setLeague(lData);
        setSlates(sData);
      })
      .catch((err: Error) => setPageError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, status, router]);

  async function loadSlateGames(slateId: string) {
    if (expandedSlateId === slateId) {
      setExpandedSlateId(null);
      return;
    }
    const [gamesRes, tbRes] = await Promise.all([
      slateGames[slateId] ? Promise.resolve(null) : fetch(`/api/leagues/${leagueId}/slates/${slateId}/games`),
      slateQuestions[slateId] ? Promise.resolve(null) : fetch(`/api/leagues/${leagueId}/slates/${slateId}/tiebreakers`),
    ]);
    if (gamesRes?.ok) {
      const data = await gamesRes.json();
      setSlateGames((prev) => ({ ...prev, [slateId]: data.games }));
    }
    if (tbRes?.ok) {
      const data: TiebreakerQuestion[] = await tbRes.json();
      setSlateQuestions((prev) => ({ ...prev, [slateId]: data }));
    }
    setExpandedSlateId(slateId);
  }

  async function handleAddQuestion(slateId: string) {
    const text = newQuestion[slateId]?.trim();
    if (!text) return;
    setAddingQuestion(slateId);
    setQuestionError((prev) => ({ ...prev, [slateId]: "" }));
    try {
      const res = await fetch(`/api/leagues/${leagueId}/slates/${slateId}/tiebreakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuestionError((prev) => ({ ...prev, [slateId]: data.error ?? "Failed to add question" }));
        return;
      }
      setSlateQuestions((prev) => ({
        ...prev,
        [slateId]: [...(prev[slateId] ?? []), data],
      }));
      setNewQuestion((prev) => ({ ...prev, [slateId]: "" }));
    } catch {
      setQuestionError((prev) => ({ ...prev, [slateId]: "Something went wrong" }));
    } finally {
      setAddingQuestion(null);
    }
  }

  async function handleSetAnswer(slateId: string, questionId: string) {
    const raw = answerInputs[questionId];
    const value = parseInt(raw, 10);
    if (isNaN(value)) return;
    setSavingAnswer(questionId);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/slates/${slateId}/tiebreakers/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: value }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to set answer");
        return;
      }
      setSlateQuestions((prev) => ({
        ...prev,
        [slateId]: (prev[slateId] ?? []).map((q) =>
          q.id === questionId ? { ...q, answer: data.answer } : q,
        ),
      }));
      setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));
    } catch {
      alert("Something went wrong");
    } finally {
      setSavingAnswer(null);
    }
  }

  async function handleCreateSlate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const nextPosition =
      slates.length > 0 ? Math.max(...slates.map((s) => s.position)) + 1 : 1;
    try {
      const res = await fetch(`/api/leagues/${leagueId}/slates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSlateName, position: nextPosition }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create slate");
        return;
      }
      setSlates((prev) => [...prev, { ...data, gameCount: 0 }]);
      setNewSlateName("");
      router.refresh();
    } catch {
      setCreateError("Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveScore(gameId: string) {
    const entry = scores[gameId];
    if (!entry) return;
    setSavingScore(gameId);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeScore: parseInt(entry.home, 10),
          awayScore: parseInt(entry.away, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to save score");
        return;
      }
      setSlateGames((prev) => {
        const updated: Record<string, Game[]> = {};
        for (const [sid, games] of Object.entries(prev)) {
          updated[sid] = games.map((g) => (g.id === gameId ? { ...g, ...data } : g));
        }
        return updated;
      });
    } catch {
      alert("Something went wrong");
    } finally {
      setSavingScore(null);
    }
  }

  async function openAddGames(slateId: string) {
    setAddGamesSlateId(slateId);
    setSelectedSportGameIds(new Set());
    setAddGamesError(null);
    setSyncEspnResult(null);
    setSportGames([]);
    setEspnDate("");
  }

  async function handleSyncEspn(slateId: string) {
    if (!espnDate) return;
    setSyncingEspn(true);
    setSyncEspnResult(null);
    setAddGamesError(null);
    // Clear the game list immediately so stale results never linger
    setSportGames([]);
    setSelectedSportGameIds(new Set());
    try {
      const dateParam = espnDate.replace(/-/g, "");
      const res = await fetch(
        `/api/leagues/${leagueId}/slates/${slateId}/sync-espn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateParam }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setAddGamesError(data.error ?? "ESPN sync failed");
        return;
      }
      setSyncEspnResult(`Synced: ${data.inserted} new, ${data.updated} updated`);
      // Use the games returned by the endpoint — these are the exact rows ESPN
      // provided for this date, so there's no timezone-boundary ambiguity.
      setSportGames(data.games ?? []);
    } catch {
      setAddGamesError("Network error during ESPN sync");
    } finally {
      setSyncingEspn(false);
    }
  }

  async function handleAddGames(e: React.FormEvent) {
    e.preventDefault();
    if (!addGamesSlateId || selectedSportGameIds.size === 0) return;
    setAddGamesError(null);
    setAddingGames(true);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/slates/${addGamesSlateId}/games`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sportGameIds: [...selectedSportGameIds] }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setAddGamesError(data.error ?? "Failed to add games");
        return;
      }
      setSlateGames((prev) => ({ ...prev, [addGamesSlateId]: data }));
      setSlates((prev) =>
        prev.map((s) =>
          s.id === addGamesSlateId ? { ...s, gameCount: data.length } : s,
        ),
      );
      setAddGamesSlateId(null);
      setSelectedSportGameIds(new Set());
      router.refresh();
    } catch {
      setAddGamesError("Something went wrong");
    } finally {
      setAddingGames(false);
    }
  }

  if (status === "loading" || loading) return <PageLoader />;

  if (pageError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{pageError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-10">
      {/* Header */}
      <h1 className="text-3xl font-bold tracking-tight text-white">Admin</h1>

      {/* Create slate */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Create Slate</h2>
        <form onSubmit={handleCreateSlate} className="flex gap-2 items-start flex-wrap">
          <input
            type="text"
            value={newSlateName}
            onChange={(e) => setNewSlateName(e.target.value)}
            placeholder="e.g. Week 1"
            required
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-56"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Slate"}
          </button>
          {createError && (
            <p className="w-full text-sm text-red-400">{createError}</p>
          )}
        </form>
      </section>

      {/* Slates list */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Slates</h2>
        {slates.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center space-y-2">
            <p className="text-base font-semibold text-white">No slates yet</p>
            <p className="text-sm text-slate-400">Create your first slate above to start adding games.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {slates.map((slate) => {
              const isExpanded = expandedSlateId === slate.id;
              const games = slateGames[slate.id] ?? [];

              return (
                <li
                  key={slate.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden transition-all"
                >
                  {/* Slate header */}
                  <button
                    onClick={() => loadSlateGames(slate.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold text-white">{slate.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[slate.status] ?? "bg-slate-800 text-slate-400"}`}
                      >
                        {slate.status}
                      </span>
                      <span className="text-sm text-slate-500">
                        {slate.gameCount} game{slate.gameCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-800 px-5 py-5 space-y-6">
                      {/* Games + score entry */}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-300">Games</p>
                        {games.length === 0 ? (
                          <p className="text-sm text-slate-500">No games yet. Add games below.</p>
                        ) : (
                          <ul className="space-y-4">
                            {games.map((game) => {
                              const scoreEntry = scores[game.id] ?? {
                                home: game.homeScore?.toString() ?? "",
                                away: game.awayScore?.toString() ?? "",
                              };
                              const isSaving = savingScore === game.id;
                              const isCompleted = game.status === "completed";

                              return (
                                <li key={game.id} className="space-y-2">
                                  <div className="text-sm space-y-0.5">
                                    <div>
                                      <span className="font-medium text-white">{game.awayTeam}</span>
                                      <span className="text-slate-500 mx-2">@</span>
                                      <span className="font-medium text-white">{game.homeTeam}</span>
                                      {isCompleted && (
                                        <span className="ml-2 text-xs font-medium text-green-400">
                                          Final: {game.awayScore}–{game.homeScore}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500">{formatDateTime(game.startTime)}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="Away"
                                      value={scoreEntry.away}
                                      onChange={(e) =>
                                        setScores((prev) => ({
                                          ...prev,
                                          [game.id]: { ...scoreEntry, away: e.target.value },
                                        }))
                                      }
                                      className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                    <span className="text-slate-500 text-sm">–</span>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="Home"
                                      value={scoreEntry.home}
                                      onChange={(e) =>
                                        setScores((prev) => ({
                                          ...prev,
                                          [game.id]: { ...scoreEntry, home: e.target.value },
                                        }))
                                      }
                                      className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                      disabled={isSaving || !scoreEntry.home || !scoreEntry.away}
                                      onClick={() => handleSaveScore(game.id)}
                                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                                    >
                                      {isSaving ? "Saving..." : isCompleted ? "Update" : "Save"}
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      {/* Tiebreaker questions */}
                      <div className="pt-4 border-t border-slate-800 space-y-3">
                        <p className="text-sm font-semibold text-slate-300">Tie-breaker Questions</p>
                        {(slateQuestions[slate.id] ?? []).length === 0 ? (
                          <p className="text-sm text-slate-500">No questions yet.</p>
                        ) : (
                          <ul className="space-y-3">
                            {(slateQuestions[slate.id] ?? []).map((q) => (
                              <li key={q.id} className="space-y-1.5">
                                <p className="text-sm text-white">{q.question}</p>
                                {q.answer !== null ? (
                                  <p className="text-xs text-slate-500">
                                    Answer:{" "}
                                    <span className="font-semibold text-green-400">{q.answer}</span>
                                  </p>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step="1"
                                      placeholder="Correct answer"
                                      value={answerInputs[q.id] ?? ""}
                                      onChange={(e) =>
                                        setAnswerInputs((prev) => ({ ...prev, [q.id]: e.target.value }))
                                      }
                                      className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                      disabled={savingAnswer === q.id || !answerInputs[q.id]}
                                      onClick={() => handleSetAnswer(slate.id, q.id)}
                                      className="rounded-lg border border-slate-700 px-3 py-1 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                                    >
                                      {savingAnswer === q.id ? "Saving..." : "Set answer"}
                                    </button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {/* Add question form */}
                        <div className="flex gap-2 items-center pt-1">
                          <input
                            type="text"
                            placeholder="New question (e.g. Total combined score?)"
                            value={newQuestion[slate.id] ?? ""}
                            onChange={(e) =>
                              setNewQuestion((prev) => ({ ...prev, [slate.id]: e.target.value }))
                            }
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            disabled={addingQuestion === slate.id || !newQuestion[slate.id]?.trim()}
                            onClick={() => handleAddQuestion(slate.id)}
                            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                          >
                            {addingQuestion === slate.id ? "Adding..." : "+ Add"}
                          </button>
                        </div>
                        {questionError[slate.id] && (
                          <p className="text-xs text-red-400">{questionError[slate.id]}</p>
                        )}
                      </div>

                      {/* Add games */}
                      <div className="pt-4 border-t border-slate-800">
                        {addGamesSlateId === slate.id ? (
                          <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-300">Add games from ESPN</p>

                            {/* Date picker + sync */}
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={espnDate}
                                onChange={(e) => {
                                  setEspnDate(e.target.value);
                                  setSyncEspnResult(null);
                                  setSportGames([]);
                                  setSelectedSportGameIds(new Set());
                                }}
                                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleSyncEspn(slate.id)}
                                disabled={!espnDate || syncingEspn}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                              >
                                {syncingEspn ? "Syncing…" : "Sync from ESPN"}
                              </button>
                              {syncEspnResult && (
                                <span className="text-xs text-green-400">{syncEspnResult}</span>
                              )}
                            </div>

                            {/* Game list */}
                            {(() => {
                              if (!espnDate) return null;
                              const existingKeys = new Set(
                                (slateGames[slate.id] ?? []).map(
                                  (g) => `${g.homeTeam}|${g.awayTeam}|${new Date(g.startTime).getTime()}`,
                                ),
                              );
                              const available = sportGames.filter(
                                (sg) =>
                                  !existingKeys.has(
                                    `${sg.homeTeam}|${sg.awayTeam}|${new Date(sg.scheduledAt).getTime()}`,
                                  ),
                              );
                              return available.length === 0 ? (
                                <p className="text-sm text-slate-500">
                                  {sportGames.length === 0
                                    ? "Pick a date and click Sync from ESPN."
                                    : "All games for this date have already been added to this slate."}
                                </p>
                              ) : (
                                <form onSubmit={handleAddGames}>
                                  <ul className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 mb-4">
                                    {available.map((sg) => (
                                      <li key={sg.id} className="flex items-start gap-2 text-sm py-1.5">
                                        <input
                                          type="checkbox"
                                          id={`sg-${sg.id}`}
                                          checked={selectedSportGameIds.has(sg.id)}
                                          onChange={(e) => {
                                            setSelectedSportGameIds((prev) => {
                                              const next = new Set(prev);
                                              if (e.target.checked) { next.add(sg.id); } else { next.delete(sg.id); }
                                              return next;
                                            });
                                          }}
                                          className="mt-0.5 shrink-0 rounded border-slate-700 bg-slate-800 accent-blue-500"
                                        />
                                        <label htmlFor={`sg-${sg.id}`} className="cursor-pointer text-slate-300 space-y-0.5">
                                          <div>
                                            <span className="font-medium text-white">{sg.awayTeam}</span>
                                            <span className="text-slate-500 mx-1">@</span>
                                            <span className="font-medium text-white">{sg.homeTeam}</span>
                                          </div>
                                          <div className="text-xs text-slate-500">{formatDateTime(sg.scheduledAt)}</div>
                                        </label>
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="flex gap-2">
                                    <button
                                      type="submit"
                                      disabled={addingGames || selectedSportGameIds.size === 0}
                                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                                    >
                                      {addingGames
                                        ? "Adding..."
                                        : `Add ${selectedSportGameIds.size > 0 ? selectedSportGameIds.size + " " : ""}game${selectedSportGameIds.size !== 1 ? "s" : ""}`}
                                    </button>
                                  </div>
                                </form>
                              );
                            })()}

                            {addGamesError && (
                              <p className="text-sm text-red-400">{addGamesError}</p>
                            )}
                            <button
                              type="button"
                              onClick={() => setAddGamesSlateId(null)}
                              className="text-sm text-slate-500 hover:text-slate-300 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openAddGames(slate.id)}
                            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition"
                          >
                            + Add games from schedule
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
