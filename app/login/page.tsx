"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// Only allow relative paths so the callbackUrl query param can't be used
// to redirect users to an external site after sign-in.
function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      });
      if (res?.ok) {
        router.push("/login/verify");
        return;
      }
      if (res?.status === 429) {
        setError(
          "Too many sign-in attempts. Please wait a few minutes and try again.",
        );
      } else {
        setError("Something went wrong sending the link. Please try again.");
      }
    } catch {
      setError("Something went wrong sending the link. Please try again.");
    } finally {
      setLoading(false);
    }
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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <p className="text-xs text-slate-500">
          We&apos;ll send you a magic link — no password needed.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
