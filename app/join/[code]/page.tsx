"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageLoader } from "@/app/components/skeleton";

export default function JoinLeaguePage() {
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    if (status !== "authenticated" || attempted.current) return;
    attempted.current = true;

    fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: code }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 201) {
          router.replace(`/leagues/${data.id}`);
          return;
        }
        if (res.status === 409 && data.leagueId) {
          // Already a member — just take them to the league.
          router.replace(`/leagues/${data.leagueId}`);
          return;
        }
        if (res.status === 404) {
          setError("This invite link is invalid or has expired.");
          return;
        }
        setError(data.error ?? "Something went wrong joining the league.");
      })
      .catch(() => setError("Something went wrong joining the league."));
  }, [status, code, router]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-sm px-6 space-y-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Couldn&apos;t join league
          </h1>
          <p className="text-sm text-red-400">{error}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return <PageLoader />;
}
