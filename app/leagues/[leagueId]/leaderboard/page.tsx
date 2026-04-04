"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";

type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  correct: number;
  totalPicks: number;
};

type Slate = {
  id: string;
  name: string;
  position: number;
  status: string;
  gameCount: number;
};

export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const [slates, setSlates] = useState<Slate[]>([]);
  const [selectedSlateId, setSelectedSlateId] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch slates once on mount
  useEffect(() => {
    if (status !== "authenticated") return;

    fetch(`/api/leagues/${leagueId}/slates`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Slate[]) => setSlates(data))
      .catch(() => {}); // slates failing silently is fine; selector just won't show
  }, [leagueId, status]);

  // Fetch leaderboard whenever selected slate changes
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    setLoading(true);
    setError(null);

    const url = selectedSlateId
      ? `/api/leagues/${leagueId}/leaderboard?slateId=${selectedSlateId}`
      : `/api/leagues/${leagueId}/leaderboard`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<LeaderboardEntry[]>;
      })
      .then(setEntries)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, status, router, selectedSlateId]);

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

  const rankLabel = (rank: number) => {
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `${rank}th`;
  };

  const selectedSlate = slates.find((s) => s.id === selectedSlateId) ?? null;
  const scopeLabel = selectedSlate ? selectedSlate.name : "Overall";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>

        {slates.length > 0 && (
          <select
            value={selectedSlateId ?? ""}
            onChange={(e) => setSelectedSlateId(e.target.value || null)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          >
            <option value="">Overall</option>
            {slates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.status !== "completed" ? " (in progress)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-zinc-500">
          No results yet for {scopeLabel}. Check back once games are completed.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500">
              <th className="pb-2 pr-4 font-medium">Rank</th>
              <th className="pb-2 pr-4 font-medium">Player</th>
              <th className="pb-2 pr-4 font-medium text-right">Correct</th>
              <th className="pb-2 font-medium text-right">Picked</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isCurrentUser = session?.user?.id === entry.userId;
              return (
                <tr
                  key={entry.userId}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${
                    isCurrentUser ? "bg-zinc-100 dark:bg-zinc-800 font-medium" : ""
                  }`}
                >
                  <td className="py-3 pr-4 text-zinc-500">{rankLabel(entry.rank)}</td>
                  <td className="py-3 pr-4">
                    {entry.name ?? entry.email}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-zinc-400">(you)</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">{entry.correct}</td>
                  <td className="py-3 text-right text-zinc-500">{entry.totalPicks}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
