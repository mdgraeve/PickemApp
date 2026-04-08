"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SPORTS } from "@/lib/sports";
import { PageLoader } from "@/app/components/skeleton";

export default function NewLeaguePage() {
  const { status } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "loading") return <PageLoader />;

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sport }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      router.push(`/leagues/${data.id}/leaderboard`);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md px-6 space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">Create a League</h1>
          <p className="text-slate-400 text-sm">Set up your pick&apos;em league and invite friends.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-slate-300">
              League name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Office Pool 2026"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="sport" className="block text-sm font-medium text-slate-300">
              Sport
            </label>
            <select
              id="sport"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>Select a sport</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create League"}
          </button>
        </form>
      </div>
    </div>
  );
}
