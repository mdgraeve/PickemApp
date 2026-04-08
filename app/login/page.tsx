"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("email", { email, callbackUrl: "/" });
  }

  return (
    <div className="flex flex-1 items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="w-full max-w-sm px-6 space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">LockHub</h1>
          <p className="text-slate-400">Lock In. Win Big. Repeat.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Sending link..." : "Sign in with Email"}
          </button>
        </form>

        <p className="text-xs text-slate-500">
          We&apos;ll send you a magic link — no password needed.
        </p>
      </div>
    </div>
  );
}
