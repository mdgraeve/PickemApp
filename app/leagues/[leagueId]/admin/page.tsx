"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
  const { data: session, status } = useSession();
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

  // Add games panel
  const [addGamesSlateId, setAddGamesSlateId] = useState<string | null>(null);
  const [sportGames, setSportGames] = useState<SportGame[]>([]);
  const [selectedSportGameIds, setSelectedSportGameIds] = useState<Set<string>>(new Set());
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [addingGames, setAddingGames] = useState(false);
  const [addGamesError, setAddGamesError] = useState<string | null>(null);

  // Fetch league + slates on mount
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
    if (slateGames[slateId]) {
      setExpandedSlateId((prev) => (prev === slateId ? null : slateId));
      return;
    }
    const res = await fetch(`/api/leagues/${leagueId}/slates/${slateId}/games`);
    if (res.ok) {
      const data = await res.json();
      setSlateGames((prev) => ({ ...prev, [slateId]: data.games }));
    }
    setExpandedSlateId((prev) => (prev === slateId ? null : slateId));
  }

  async function handleCreateSlate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    // Auto-assign the next position so the admin never has to think about it.
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
      // Invalidate the router cache so the league home page shows the new slate.
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
      // Update local game list
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
    if (sportGames.length > 0) return; // already loaded
    setLoadingSchedule(true);
    try {
      const sport = league?.sport ?? "";
      const res = await fetch(`/api/sport-games?sport=${encodeURIComponent(sport)}`);
      if (res.ok) {
        const data = await res.json();
        setSportGames(data);
      }
    } finally {
      setLoadingSchedule(false);
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
      // Refresh slate games and invalidate router cache.
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

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-500">{pageError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← {league?.name}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      </div>

      {/* Create slate */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Create Slate</h2>
        <form onSubmit={handleCreateSlate} className="flex gap-3 items-start flex-wrap">
          <input
            type="text"
            value={newSlateName}
            onChange={(e) => setNewSlateName(e.target.value)}
            placeholder="Slate name (e.g. Week 1)"
            required
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 w-48"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          {createError && (
            <p className="w-full text-sm text-red-500">{createError}</p>
          )}
        </form>
      </section>

      {/* Slates list */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Slates</h2>
        {slates.length === 0 ? (
          <p className="text-zinc-500">No slates yet.</p>
        ) : (
          <ul className="space-y-3">
            {slates.map((slate) => {
              const isExpanded = expandedSlateId === slate.id;
              const games = slateGames[slate.id] ?? [];

              return (
                <li
                  key={slate.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800"
                >
                  {/* Slate header */}
                  <button
                    onClick={() => loadSlateGames(slate.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl"
                  >
                    <div>
                      <span className="font-medium">{slate.name}</span>
                      <span className="ml-3 text-sm text-zinc-500 capitalize">{slate.status}</span>
                      <span className="ml-3 text-sm text-zinc-400">{slate.gameCount} game{slate.gameCount !== 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-zinc-400">{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-4 space-y-4">
                      {/* Games + score entry */}
                      {games.length === 0 ? (
                        <p className="text-sm text-zinc-500">No games yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {games.map((game) => {
                            const scoreEntry = scores[game.id] ?? {
                              home: game.homeScore?.toString() ?? "",
                              away: game.awayScore?.toString() ?? "",
                            };
                            const isSaving = savingScore === game.id;

                            return (
                              <li key={game.id} className="space-y-2">
                                <div className="text-sm">
                                  <span className="font-medium">{game.awayTeam}</span>
                                  <span className="text-zinc-400 mx-2">@</span>
                                  <span className="font-medium">{game.homeTeam}</span>
                                  <span className="ml-3 text-zinc-400">{formatDateTime(game.startTime)}</span>
                                  {game.status === "completed" && (
                                    <span className="ml-2 text-xs text-zinc-400">
                                      Final: {game.awayScore}–{game.homeScore}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
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
                                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                                  />
                                  <span className="text-zinc-400 text-sm">–</span>
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
                                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                                  />
                                  <button
                                    disabled={isSaving || !scoreEntry.home || !scoreEntry.away}
                                    onClick={() => handleSaveScore(game.id)}
                                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Add games button */}
                      {addGamesSlateId === slate.id ? (
                        <form onSubmit={handleAddGames} className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                          <p className="text-sm font-medium">Add games from schedule</p>
                          {loadingSchedule ? (
                            <p className="text-sm text-zinc-500">Loading schedule...</p>
                          ) : (() => {
                            // Filter out games already in this slate by matching
                            // home team + away team + start time.
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
                            <p className="text-sm text-zinc-500">
                              {sportGames.length === 0
                                ? <>No games found for {league?.sport}. Run{" "}
                                    <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                                      npx prisma db seed
                                    </code>{" "}
                                    to populate the schedule.</>
                                : "All scheduled games have already been added to this slate."}
                            </p>
                          ) : (
                            <ul className="space-y-1 max-h-64 overflow-y-auto">
                              {available.map((sg) => (
                                <li key={sg.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    id={`sg-${sg.id}`}
                                    checked={selectedSportGameIds.has(sg.id)}
                                    onChange={(e) => {
                                      setSelectedSportGameIds((prev) => {
                                        const next = new Set(prev);
                                        e.target.checked ? next.add(sg.id) : next.delete(sg.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded"
                                  />
                                  <label htmlFor={`sg-${sg.id}`} className="cursor-pointer">
                                    {sg.awayTeam} @ {sg.homeTeam}
                                    <span className="ml-2 text-zinc-400">{formatDateTime(sg.scheduledAt)}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          );
                          })()}
                          {addGamesError && (
                            <p className="text-sm text-red-500">{addGamesError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={addingGames || selectedSportGameIds.size === 0}
                              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                            >
                              {addingGames ? "Adding..." : `Add ${selectedSportGameIds.size || ""} game${selectedSportGameIds.size !== 1 ? "s" : ""}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddGamesSlateId(null)}
                              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => openAddGames(slate.id)}
                          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                        >
                          + Add games from schedule
                        </button>
                      )}
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
