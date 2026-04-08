"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageLoader } from "@/app/components/skeleton";

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
