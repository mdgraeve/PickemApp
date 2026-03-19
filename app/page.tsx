"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">LockHub</h1>
          <p className="text-zinc-500">Lock In. Win Big. Repeat.</p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">LockHub</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium">{session.user.email}</span>
        </p>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
