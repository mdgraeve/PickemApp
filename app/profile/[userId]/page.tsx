"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type StatRow = {
  leagueId: string;
  leagueName: string;
  sport: string | null;
  correctPicks: number;
  totalPicks: number;
  accuracy: number | null;
};

type PickHistoryItem = {
  gameId: string;
  leagueId: string;
  leagueName: string;
  slateName: string | null;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homeScore: number | null;
  awayScore: number | null;
  pickedTeam: string;
  isCorrect: boolean | null;
};

type Profile = {
  id: string;
  name: string | null;
  createdAt: string;
  stats: StatRow[];
  pickHistory: PickHistoryItem[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatGameDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    fetch(`/api/users/${userId}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data: Profile) => setProfile(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId, status, router]);

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

  if (!profile) return null;

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const isSelf = currentUserId === userId;

  const displayName = profile.name ?? "Anonymous";
  const totalCorrect = profile.stats.reduce((sum, s) => sum + s.correctPicks, 0);
  const totalPicks = profile.stats.reduce((sum, s) => sum + s.totalPicks, 0);
  const overallAccuracy = totalPicks > 0 ? Math.round((totalCorrect / totalPicks) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
        </div>
        {isSelf && (
          <Link
            href="/settings"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Meta */}
      <div className="flex gap-6 text-sm text-zinc-500">
        <span>Joined {formatDate(profile.createdAt)}</span>
      </div>

      {/* Overall stat summary */}
      {totalPicks > 0 && (
        <div className="flex gap-8">
          <div className="text-center">
            <p className="text-2xl font-bold">{totalCorrect}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Correct picks</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{totalPicks}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Total picks</p>
          </div>
          {overallAccuracy !== null && (
            <div className="text-center">
              <p className="text-2xl font-bold">{overallAccuracy}%</p>
              <p className="text-xs text-zinc-500 mt-0.5">Accuracy</p>
            </div>
          )}
        </div>
      )}

      {/* Per-league stats */}
      {profile.stats.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Stats by League</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">League</th>
                  <th className="px-4 py-2 font-medium">Sport</th>
                  <th className="px-4 py-2 font-medium text-right">Correct</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {profile.stats.map((row) => (
                  <tr key={row.leagueId}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/leagues/${row.leagueId}`}
                        className="text-zinc-700 hover:underline dark:text-zinc-300"
                      >
                        {row.leagueName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{row.sport ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{row.correctPicks}</td>
                    <td className="px-4 py-2 text-right">{row.totalPicks}</td>
                    <td className="px-4 py-2 text-right">
                      {row.accuracy !== null ? `${row.accuracy}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent pick history */}
      {profile.pickHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Recent Picks</h2>
          <ul className="space-y-2">
            {profile.pickHistory.map((pick) => {
              const isScored = pick.isCorrect !== null;
              return (
                <li
                  key={pick.gameId}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium">
                      {pick.awayTeam} @ {pick.homeTeam}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {pick.leagueName}
                      {pick.slateName ? ` · ${pick.slateName}` : ""}
                      {" · "}
                      {formatGameDate(pick.startTime)}
                    </p>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    <span className="text-xs text-zinc-500">Picked</span>
                    <span className="font-medium">{pick.pickedTeam}</span>
                    {isScored && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          pick.isCorrect
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {pick.isCorrect ? "Correct" : "Wrong"}
                      </span>
                    )}
                    {!isScored && pick.homeScore === null && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                        Pending
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {profile.stats.length === 0 && profile.pickHistory.length === 0 && (
        <p className="text-zinc-500">No picks submitted yet.</p>
      )}
    </div>
  );
}
