"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageLoader } from "@/app/components/skeleton";

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

  if (status === "loading" || loading) return <PageLoader />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-400">{error}</p>
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
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">{displayName}</h1>
          <p className="text-sm text-slate-400">Joined {formatDate(profile.createdAt)}</p>
        </div>
        {isSelf && (
          <Link
            href="/settings"
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Overall stats */}
      {totalPicks > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-center">
            <p className="text-3xl font-bold text-white tabular-nums">
              {totalCorrect}-{totalPicks - totalCorrect}
            </p>
            <p className="mt-1 text-xs text-slate-400">Record (W-L)</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-center">
            <p className="text-3xl font-bold text-white">{totalPicks}</p>
            <p className="mt-1 text-xs text-slate-400">Total picks</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-center">
            <p className="text-3xl font-bold text-white">
              {overallAccuracy !== null ? `${overallAccuracy}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Accuracy</p>
          </div>
        </div>
      )}

      {/* Per-league stats */}
      {profile.stats.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Stats by League</h2>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">League</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Sport</th>
                  <th className="px-5 py-3 font-medium text-right">Record</th>
                  <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Pct</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {profile.stats.map((row) => (
                  <tr key={row.leagueId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/leagues/${row.leagueId}`}
                        className="font-medium text-white hover:text-blue-400 transition"
                      >
                        {row.leagueName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">
                      {row.sport ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-white font-medium tabular-nums">
                      {row.correctPicks}-{row.totalPicks - row.correctPicks}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-400 hidden sm:table-cell">{row.totalPicks}</td>
                    <td className="px-5 py-3 text-right text-slate-400">
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
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Recent Picks</h2>
          <ul className="space-y-2">
            {profile.pickHistory.map((pick) => {
              const isScored = pick.isCorrect !== null;
              return (
                <li
                  key={pick.gameId}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium text-white">
                      {pick.awayTeam} @ {pick.homeTeam}
                    </p>
                    <p className="text-xs text-slate-400">
                      {pick.leagueName}
                      {pick.slateName ? ` · ${pick.slateName}` : ""}
                      {" · "}
                      {formatGameDate(pick.startTime)}
                    </p>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-500">Picked</span>
                    <span className="font-medium text-white">{pick.pickedTeam}</span>
                    {isScored && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          pick.isCorrect
                            ? "bg-green-900/40 text-green-400"
                            : "bg-red-900/40 text-red-400"
                        }`}
                      >
                        {pick.isCorrect ? "Correct" : "Wrong"}
                      </span>
                    )}
                    {!isScored && pick.homeScore === null && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center">
          <p className="text-slate-400">No picks submitted yet.</p>
        </div>
      )}
    </div>
  );
}
