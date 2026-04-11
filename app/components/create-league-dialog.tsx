"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SPORTS } from "@/lib/sports";

type CreatedLeague = {
  id: string;
  name: string;
  sport: string | null;
  inviteCode: string;
  memberCount: number;
  role: string;
  description: string | null;
  maxMembers: number | null;
  isPrivate: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the new league after successful creation. If omitted, navigates to the league page. */
  onCreated?: (league: CreatedLeague) => void;
};

const SPORT_EMOJI: Record<string, string> = {
  NFL: "🏈",
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NCAAF: "🏈",
  NCAAB: "🏀",
};

export function CreateLeagueDialog({ open, onClose, onCreated }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [description, setDescription] = useState("");
  const [limitMembers, setLimitMembers] = useState(false);
  const [maxMembers, setMaxMembers] = useState(10);
  const [isPrivate, setIsPrivate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetForm() {
    setName("");
    setSport("");
    setDescription("");
    setLimitMembers(false);
    setMaxMembers(10);
    setIsPrivate(true);
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sport) {
      setError("Please select a sport.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sport,
          description: description.trim() || null,
          maxMembers: limitMembers ? maxMembers : null,
          isPrivate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      const created: CreatedLeague = {
        ...data,
        memberCount: 1,
        role: "admin",
      };

      if (onCreated) {
        onCreated(created);
        handleClose();
      } else {
        router.push(`/leagues/${data.id}/leaderboard`);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleMaxMembersChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) return;
    setMaxMembers(Math.min(500, Math.max(2, raw)));
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-league-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2
              id="create-league-title"
              className="text-xl font-semibold text-white"
            >
              Create a League
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Set up your pick&apos;em league and invite friends.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          onSubmit={handleSubmit}
          id="create-league-form"
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* ── League name ── */}
            <div className="space-y-1.5">
              <label
                htmlFor="league-name"
                className="block text-sm font-medium text-slate-300"
              >
                League name <span className="text-red-400">*</span>
              </label>
              <input
                id="league-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Office Pool 2026"
                required
                maxLength={80}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* ── Sport picker ── */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-300">
                Sport <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SPORTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSport(s)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition ${
                      sport === s
                        ? "border-blue-500 bg-blue-600/20 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                    }`}
                  >
                    <span className="text-2xl leading-none">
                      {SPORT_EMOJI[s] ?? "🏟️"}
                    </span>
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Description ── */}
            <div className="space-y-1.5">
              <label
                htmlFor="league-description"
                className="block text-sm font-medium text-slate-300"
              >
                Description{" "}
                <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <textarea
                id="league-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this league about? E.g. Work crew, winner buys lunch."
                rows={3}
                maxLength={300}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-right text-xs text-slate-500">
                {description.length}/300
              </p>
            </div>

            {/* ── Member limit ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    Member limit
                  </p>
                  <p className="text-xs text-slate-500">
                    Cap how many people can join
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={limitMembers}
                  onClick={() => setLimitMembers((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                    limitMembers ? "bg-blue-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      limitMembers ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {limitMembers && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={maxMembers}
                    onChange={handleMaxMembersChange}
                    min={2}
                    max={500}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-center text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-400">max members</span>
                </div>
              )}
            </div>

            {/* ── Visibility ── */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">Visibility</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition ${
                    isPrivate
                      ? "border-blue-500 bg-blue-600/20 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                  }`}
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition ${
                    !isPrivate
                      ? "border-blue-500 bg-blue-600/20 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                  }`}
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Public
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {isPrivate
                  ? "Only members with your invite code can join."
                  : "Your league will appear in the public directory (coming soon)."}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              {error ? (
                <p className="text-sm text-red-400 truncate">{error}</p>
              ) : !sport ? (
                <p className="text-xs text-slate-500">Select a sport to continue</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !sport || !name.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create League"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
