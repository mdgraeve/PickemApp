"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/app/components/skeleton";
import { SPORTS } from "@/lib/sports";

type SyncStatus = "idle" | "syncing" | "success" | "error";

type SportState = {
  status: SyncStatus;
  inserted?: number;
  updated?: number;
  error?: string;
};

function defaultStates(): Record<string, SportState> {
  return Object.fromEntries(SPORTS.map((s) => [s, { status: "idle" }]));
}

// Format today as YYYY-MM-DD for the date input default
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const [date, setDate] = useState(todayDateString);
  const [sportStates, setSportStates] = useState<Record<string, SportState>>(defaultStates);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") return <PageLoader />;

  async function handleSync(sport: string) {
    setSportStates((prev) => ({ ...prev, [sport]: { status: "syncing" } }));
    try {
      const dateParam = date.replace(/-/g, ""); // YYYY-MM-DD → YYYYMMDD
      const res = await fetch("/api/admin/sync-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, date: dateParam }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSportStates((prev) => ({
          ...prev,
          [sport]: { status: "error", error: data.error ?? "Unknown error" },
        }));
        return;
      }
      setSportStates((prev) => ({
        ...prev,
        [sport]: { status: "success", inserted: data.inserted, updated: data.updated },
      }));
    } catch {
      setSportStates((prev) => ({
        ...prev,
        [sport]: { status: "error", error: "Network error" },
      }));
    }
  }

  function handleSyncAll() {
    for (const sport of SPORTS) {
      handleSync(sport);
    }
  }

  const dateValid = date.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">
          App Admin
        </p>
        <h1 className="text-3xl font-bold text-white">Schedule Sync</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Import games from ESPN into the SportGame master schedule. Existing
          games are updated; new ones are inserted. Only authorised emails can
          trigger a sync.
        </p>
      </div>

      {/* Date input */}
      <div className="space-y-2">
        <label htmlFor="date" className="text-sm font-medium text-slate-300">
          Date
        </label>
        <div className="flex items-center gap-3">
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSyncAll}
            disabled={!dateValid}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
          >
            Sync all sports
          </button>
        </div>
      </div>

      {/* Per-sport rows */}
      <ul className="space-y-3">
        {SPORTS.map((sport) => {
          const state = sportStates[sport];
          const isSyncing = state.status === "syncing";

          return (
            <li
              key={sport}
              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 gap-4"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold text-white">{sport}</p>
                {state.status === "success" && (
                  <p className="text-xs text-green-400">
                    ✓ {state.inserted} inserted, {state.updated} updated
                  </p>
                )}
                {state.status === "error" && (
                  <p className="text-xs text-red-400 truncate">{state.error}</p>
                )}
                {state.status === "syncing" && (
                  <p className="text-xs text-slate-400">Syncing…</p>
                )}
              </div>
              <button
                onClick={() => handleSync(sport)}
                disabled={isSyncing || !dateValid}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                {isSyncing ? "Syncing…" : "Sync"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
