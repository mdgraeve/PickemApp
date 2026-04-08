"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageLoader } from "@/app/components/skeleton";

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

const MEDALS = ["🥇", "🥈", "🥉"];

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

  useEffect(() => {
    if (status !== "authenticated") return;

    fetch(`/api/leagues/${leagueId}/slates`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Slate[]) => setSlates(data))
      .catch(() => {});
  }, [leagueId, status]);

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

  if (status === "loading" || loading) return <PageLoader />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const selectedSlate = slates.find((s) => s.id === selectedSlateId) ?? null;
  const scopeLabel = selectedSlate ? selectedSlate.name : "Overall";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">Leaderboard</h1>

        <div className="flex items-center gap-3">
          {slates.length > 0 && (
            <select
              value={selectedSlateId ?? ""}
              onChange={(e) => setSelectedSlateId(e.target.value || null)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none transition focus:border-blue-500"
            >
              <option value="">Overall</option>
              {slates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status !== "completed" ? " (in progress)" : ""}
                </option>
              ))}
            </select>
          )}
          {selectedSlateId && (
            <Link
              href={`/leagues/${leagueId}/slates/${selectedSlateId}`}
              className="text-sm text-blue-400 hover:text-blue-300 transition"
            >
              View games →
            </Link>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center">
          <p className="text-base font-semibold text-white">No standings yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Results for {scopeLabel} will appear once games are scored.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="px-3 sm:px-5 py-3 font-medium">Rank</th>
                <th className="px-3 sm:px-5 py-3 font-medium">Player</th>
                <th className="px-3 sm:px-5 py-3 font-medium text-right">Correct</th>
                <th className="hidden sm:table-cell px-5 py-3 font-medium text-right">Picked</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isCurrentUser = session?.user?.id === entry.userId;
                const medal = MEDALS[entry.rank - 1];

                return (
                  <tr
                    key={entry.userId}
                    className={`border-b border-slate-800/60 last:border-0 transition-colors ${
                      isCurrentUser
                        ? "bg-blue-950/40"
                        : "hover:bg-slate-800/30"
                    }`}
                  >
                    <td className="px-3 sm:px-5 py-3 text-slate-400 font-medium">
                      {medal ?? entry.rank}
                    </td>
                    <td className="px-3 sm:px-5 py-3">
                      <Link
                        href={`/profile/${entry.userId}`}
                        className="font-medium text-white hover:text-blue-400 transition"
                      >
                        {entry.name ?? entry.email}
                      </Link>
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-slate-500">(you)</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-5 py-3 text-right font-semibold text-white">{entry.correct}</td>
                    <td className="hidden sm:table-cell px-5 py-3 text-right text-slate-400">{entry.totalPicks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
