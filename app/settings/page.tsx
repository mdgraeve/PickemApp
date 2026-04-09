"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageLoader } from "@/app/components/skeleton";
import { useTheme, THEMES, THEME_LABELS, THEME_SWATCHES } from "@/lib/theme";

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  const { theme, setTheme } = useTheme();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setSuccess(true);
      await updateSession({ name: data.name });
    } catch {
      setError("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") return <PageLoader />;

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <div className="mx-auto max-w-lg px-4 py-10 space-y-10">
      <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>

      {/* Display name */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Display Name</h2>
          <p className="mt-1 text-sm text-slate-400">
            Shown to other league members on leaderboards and your profile.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false); }}
            placeholder="Your display name"
            required
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">Display name saved.</p>}
      </section>

      {/* Appearance — theme picker */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Appearance</h2>
          <p className="mt-1 text-sm text-slate-400">
            Choose a color theme. Saved in your browser.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const s = THEME_SWATCHES[t];
            const active = theme === t;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  active
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-slate-700 hover:border-slate-500"
                }`}
                style={{ background: s.bg }}
              >
                {/* Mini preview swatch */}
                <div
                  className="mb-2 flex items-center gap-1.5 rounded-lg p-2"
                  style={{ background: s.surface }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: s.accent }}
                  />
                  <div
                    className="h-2 flex-1 rounded-sm opacity-60"
                    style={{ background: s.text }}
                  />
                </div>
                <p className="text-xs font-semibold" style={{ color: s.text }}>
                  {THEME_LABELS[t]}
                </p>
                {active && (
                  <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-[10px]">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Profile link */}
      {currentUserId && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">Your Profile</h2>
          <Link
            href={`/profile/${currentUserId}`}
            className="text-sm text-blue-400 hover:text-blue-300 transition"
          >
            View your public profile →
          </Link>
        </section>
      )}
    </div>
  );
}
