"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

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
      // Refresh session so navbar / profile reflect the new name
      await updateSession({ name: data.name });
    } catch {
      setError("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Display name */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Display Name</h2>
        <p className="text-sm text-zinc-500">
          This name is shown to other league members on leaderboards and your profile.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false); }}
            placeholder="Your display name"
            required
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">Display name saved.</p>}
      </section>

      {/* Profile link */}
      {currentUserId && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Your Profile</h2>
          <Link
            href={`/profile/${currentUserId}`}
            className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            View your public profile →
          </Link>
        </section>
      )}
    </div>
  );
}
