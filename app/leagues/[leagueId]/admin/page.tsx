"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { PageLoader } from "@/app/components/skeleton";
import { NCAAF_CONFERENCES, inferFootballSeason } from "@/lib/football";

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

  // Expanded slate: games (read-only — scores come from ESPN cron)
  const [expandedSlateId, setExpandedSlateId] = useState<string | null>(null);
  const [slateGames, setSlateGames] = useState<Record<string, Game[]>>({});

  // Tiebreaker state
  const [slateQuestions, setSlateQuestions] = useState<Record<string, TiebreakerQuestion[]>>({});
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [addingQuestion, setAddingQuestion] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<Record<string, string>>({});
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [savingAnswer, setSavingAnswer] = useState<string | null>(null);

  // Auto-slate (NFL / NCAAF only)
  const [autoSlateOpen, setAutoSlateOpen] = useState(false);
  const [autoWeek, setAutoWeek] = useState(1);
  const [autoSeason, setAutoSeason] = useState(() => inferFootballSeason());
  const [autoConfs, setAutoConfs] = useState<Set<number>>(new Set());
  const [autoPreviewGames, setAutoPreviewGames] = useState<SportGame[]>([]);
  const [selectedAutoIds, setSelectedAutoIds] = useState<Set<string>>(new Set());
  const [autoSlateName, setAutoSlateName] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [creatingAuto, setCreatingAuto] = useState(false);
  const [autoCreateError, setAutoCreateError] = useState<string | null>(null);

  // Manual score override (break-glass when ESPN sync fails)
  const [overrideGameId, setOverrideGameId] = useState<string | null>(null);
  const [overrideAway, setOverrideAway] = useState("");
  const [overrideHome, setOverrideHome] = useState("");
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Force-promote slate (break-glass when cron promotion didn't fire)
  const [promotingSlateId, setPromotingSlateId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

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

  async function openAutoSlate() {
    setAutoSlateOpen(true);
    setAutoPreviewGames([]);
    setSelectedAutoIds(new Set());
    setAutoSlateName("");
    setPreviewError(null);
    setAutoCreateError(null);
    // Fetch the current week from ESPN to seed the week selector
    try {
      const res = await fetch(`/api/leagues/${leagueId}/slates/auto-preview`);
      if (res.ok) {
        const data = await res.json();
        setAutoWeek(data.weekNumber ?? 1);
        setAutoSeason(data.season ?? inferFootballSeason());
      }
    } catch {
      // Non-fatal: admin can set week manually
    }
  }

  function closeAutoSlate() {
    setAutoSlateOpen(false);
    setAutoPreviewGames([]);
    setSelectedAutoIds(new Set());
    setAutoSlateName("");
    setPreviewError(null);
    setAutoCreateError(null);
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    setAutoPreviewGames([]);
    setSelectedAutoIds(new Set());
    setAutoSlateName("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/slates/auto-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: autoWeek,
          season: autoSeason,
          conferences: autoConfs.size > 0 ? [...autoConfs] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? "Preview failed");
        return;
      }
      setAutoPreviewGames(data.sportGames ?? []);
      setSelectedAutoIds(new Set((data.sportGames ?? []).map((g: SportGame) => g.id)));
      setAutoSlateName(data.slateName ?? "");
    } catch {
      setPreviewError("Network error — could not reach ESPN");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleAutoCreate() {
    if (selectedAutoIds.size === 0 || !autoSlateName.trim()) return;
    setCreatingAuto(true);
    setAutoCreateError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/slates/auto-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoSlateName.trim(),
          sportGameIds: [...selectedAutoIds],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAutoCreateError(data.error ?? "Failed to create slate");
        return;
      }
      setSlates((prev) => [...prev, { ...data.slate }]);
      closeAutoSlate();
      router.refresh();
    } catch {
      setAutoCreateError("Something went wrong");
    } finally {
      setCreatingAuto(false);
    }
  }

  async function handleForcePromote(slateId: string) {
    setPromotingSlateId(slateId);
    setPromoteError(null);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/slates/${slateId}/promote`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setPromoteError(data.error ?? "Promotion failed");
        return;
      }
      // Update local slate state to reflect completed + newly active slate
      setSlates((prev) =>
        prev.map((s) => {
          if (s.id === slateId) return { ...s, status: "completed" };
          if (s.id === data.activated) return { ...s, status: "active" };
          return s;
        }),
      );
    } catch {
      setPromoteError("Something went wrong");
    } finally {
      setPromotingSlateId(null);
    }
  }

  function openOverride(gameId: string) {
    setOverrideGameId(gameId);
    setOverrideAway("");
    setOverrideHome("");
    setOverrideError(null);
  }

  function closeOverride() {
    setOverrideGameId(null);
    setOverrideAway("");
    setOverrideHome("");
    setOverrideError(null);
  }

  async function handleOverrideSave(slateId: string, gameId: string) {
    const awayScore = parseInt(overrideAway, 10);
    const homeScore = parseInt(overrideHome, 10);
    if (isNaN(awayScore) || isNaN(homeScore) || awayScore < 0 || homeScore < 0) {
      setOverrideError("Enter valid non-negative scores for both teams.");
      return;
    }
    setSavingOverride(gameId);
    setOverrideError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeScore, awayScore }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOverrideError(data.error ?? "Failed to save score");
        return;
      }
      setSlateGames((prev) => ({
        ...prev,
        [slateId]: (prev[slateId] ?? []).map((g) =>
          g.id === gameId
            ? { ...g, homeScore: data.homeScore, awayScore: data.awayScore, status: "completed" }
            : g,
        ),
      }));
      closeOverride();
    } catch {
      setOverrideError("Something went wrong");
    } finally {
      setSavingOverride(null);
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

      {/* Auto-create slate — NFL and NCAAF only */}
      {(league?.sport === "NFL" || league?.sport === "NCAAF") && (
        <section className="space-y-4">
          {!autoSlateOpen ? (
            <button
              onClick={openAutoSlate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Auto-create Slate
            </button>
          ) : (
            <div className="rounded-2xl border border-blue-800/40 bg-blue-950/20 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Auto-create Slate</h3>
                <button
                  type="button"
                  onClick={closeAutoSlate}
                  className="text-slate-500 hover:text-white transition text-sm"
                >
                  Cancel
                </button>
              </div>

              {/* Week + season selector */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAutoWeek((w) => Math.max(1, w - 1))}
                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800 transition text-sm"
                  >
                    ←
                  </button>
                  <span className="px-3 py-1.5 text-sm font-semibold text-white min-w-[6rem] text-center">
                    Week {autoWeek}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoWeek((w) => Math.min(22, w + 1))}
                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800 transition text-sm"
                  >
                    →
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Season</label>
                  <input
                    type="number"
                    value={autoSeason}
                    onChange={(e) => setAutoSeason(parseInt(e.target.value, 10) || autoSeason)}
                    className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Conference filter — NCAAF only */}
              {league.sport === "NCAAF" && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Filter by Conference
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {NCAAF_CONFERENCES.map((conf) => {
                      const checked = autoConfs.has(conf.id);
                      return (
                        <label
                          key={conf.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
                            checked
                              ? "border-blue-500 bg-blue-600/20 text-white"
                              : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => {
                              setAutoConfs((prev) => {
                                const next = new Set(prev);
                                if (next.has(conf.id)) next.delete(conf.id);
                                else next.add(conf.id);
                                return next;
                              });
                            }}
                          />
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 rounded border transition ${
                              checked ? "border-blue-500 bg-blue-500" : "border-slate-600"
                            }`}
                          />
                          <span className="font-medium">{conf.abbrev}</span>
                          <span className="hidden sm:inline text-xs text-slate-500 truncate">
                            {conf.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {autoConfs.size === 0 && (
                    <p className="text-xs text-slate-500">
                      No filter selected — all FBS games for this week will be shown.
                    </p>
                  )}
                </div>
              )}

              {/* Preview button */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {previewing ? "Fetching games…" : "Preview Games"}
                </button>
                {previewError && (
                  <p className="text-sm text-red-400">{previewError}</p>
                )}
              </div>

              {/* Game preview list */}
              {autoPreviewGames.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-300">
                      {autoPreviewGames.length} game{autoPreviewGames.length !== 1 ? "s" : ""} found
                      {selectedAutoIds.size !== autoPreviewGames.length && (
                        <span className="ml-1 text-slate-500">
                          ({selectedAutoIds.size} selected)
                        </span>
                      )}
                    </p>
                    <div className="flex gap-3 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => setSelectedAutoIds(new Set(autoPreviewGames.map((g) => g.id)))}
                        className="hover:text-slate-300 transition"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAutoIds(new Set())}
                        className="hover:text-slate-300 transition"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>

                  <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 divide-y divide-slate-800">
                    {autoPreviewGames.map((game) => {
                      const checked = selectedAutoIds.has(game.id);
                      return (
                        <li key={game.id}>
                          <label className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition ${checked ? "" : "opacity-50"}`}>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => {
                                setSelectedAutoIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(game.id)) next.delete(game.id);
                                  else next.add(game.id);
                                  return next;
                                });
                              }}
                            />
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 rounded border transition ${
                                checked ? "border-blue-500 bg-blue-500" : "border-slate-600"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white">
                                <span className="font-medium">{game.awayTeam}</span>
                                <span className="text-slate-500 mx-1.5">@</span>
                                <span className="font-medium">{game.homeTeam}</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatDateTime(game.scheduledAt)}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Slate name + create */}
                  <div className="space-y-3 pt-1 border-t border-slate-800">
                    <div className="space-y-1.5">
                      <label htmlFor="auto-slate-name" className="block text-sm font-medium text-slate-300">
                        Slate name
                      </label>
                      <input
                        id="auto-slate-name"
                        type="text"
                        value={autoSlateName}
                        onChange={(e) => setAutoSlateName(e.target.value)}
                        maxLength={80}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {autoCreateError && (
                      <p className="text-sm text-red-400">{autoCreateError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleAutoCreate}
                      disabled={creatingAuto || selectedAutoIds.size === 0 || !autoSlateName.trim()}
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                    >
                      {creatingAuto
                        ? "Creating…"
                        : `Create Slate with ${selectedAutoIds.size} game${selectedAutoIds.size !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              )}

              {autoPreviewGames.length === 0 && !previewing && !previewError && autoSlateName === "" && (
                <p className="text-sm text-slate-500">
                  Select a week{league.sport === "NCAAF" ? " and optionally filter by conference" : ""}, then click Preview Games.
                </p>
              )}
            </div>
          )}
        </section>
      )}

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
                              const isCompleted = game.status === "completed";
                              const isOverriding = overrideGameId === game.id;

                              return (
                                <li key={game.id} className="text-sm space-y-1.5">
                                  {/* Game header */}
                                  <div className="flex items-center flex-wrap gap-x-1">
                                    <span className="font-medium text-white">{game.awayTeam}</span>
                                    <span className="text-slate-500">@</span>
                                    <span className="font-medium text-white">{game.homeTeam}</span>
                                    {isCompleted ? (
                                      <span className="ml-1 text-xs font-medium text-green-400">
                                        Final: {game.awayScore}–{game.homeScore}
                                      </span>
                                    ) : (
                                      <span className="ml-1 text-xs text-slate-500">Pending</span>
                                    )}
                                  </div>

                                  {/* Timestamp + auto-sync hint */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">{formatDateTime(game.startTime)}</span>
                                    {!isCompleted && !isOverriding && (
                                      <span className="text-xs text-slate-600">· Score syncs automatically via ESPN</span>
                                    )}
                                  </div>

                                  {/* Manual override — collapsed by default */}
                                  {!isCompleted && (
                                    isOverriding ? (
                                      <div className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-3 space-y-2.5">
                                        <p className="text-xs font-medium text-amber-400">
                                          ⚠ Break-glass override — only use if ESPN sync has failed
                                        </p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <div className="flex items-center gap-1.5">
                                            <label className="text-xs text-slate-400 w-20 truncate">{game.awayTeam}</label>
                                            <input
                                              type="number"
                                              min={0}
                                              value={overrideAway}
                                              onChange={(e) => setOverrideAway(e.target.value)}
                                              placeholder="0"
                                              className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-white text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                          </div>
                                          <span className="text-slate-500 text-xs">–</span>
                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="number"
                                              min={0}
                                              value={overrideHome}
                                              onChange={(e) => setOverrideHome(e.target.value)}
                                              placeholder="0"
                                              className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-white text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            />
                                            <label className="text-xs text-slate-400 w-20 truncate">{game.homeTeam}</label>
                                          </div>
                                        </div>
                                        {overrideError && (
                                          <p className="text-xs text-red-400">{overrideError}</p>
                                        )}
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            disabled={savingOverride === game.id}
                                            onClick={() => handleOverrideSave(slate.id, game.id)}
                                            className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                                          >
                                            {savingOverride === game.id ? "Saving…" : "Save Final Score"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={closeOverride}
                                            className="text-xs text-slate-500 hover:text-slate-300 transition"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openOverride(game.id)}
                                        className="text-xs text-slate-600 hover:text-amber-400 transition"
                                      >
                                        Override score manually
                                      </button>
                                    )
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      {/* Force-promote (active slates only, break-glass) */}
                      {slate.status === "active" && (
                        <div className="pt-4 border-t border-slate-800 space-y-2">
                          <p className="text-xs text-slate-500">
                            If ESPN sync did not fire and all games are already scored, use this to close the slate and activate the next one.
                          </p>
                          {promoteError && promotingSlateId === slate.id && (
                            <p className="text-xs text-red-400">{promoteError}</p>
                          )}
                          <button
                            type="button"
                            disabled={promotingSlateId === slate.id}
                            onClick={() => handleForcePromote(slate.id)}
                            className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-900/40 disabled:opacity-50"
                          >
                            {promotingSlateId === slate.id ? "Promoting…" : "Force complete & promote"}
                          </button>
                        </div>
                      )}

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
