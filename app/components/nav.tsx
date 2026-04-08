"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type LeagueInfo = {
  id: string;
  name: string;
  role: string;
};

function parseLeagueId(pathname: string): string | null {
  const match = pathname.match(/^\/leagues\/([^/]+)/);
  return match ? match[1] : null;
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 text-sm font-medium transition-colors rounded-md ${
        active
          ? "text-white bg-slate-800"
          : "text-slate-400 hover:text-white hover:bg-slate-800/60"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Nav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const leagueId = parseLeagueId(pathname);
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!leagueId || status !== "authenticated") {
      setLeague(null);
      return;
    }
    fetch(`/api/leagues/${leagueId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setLeague(data))
      .catch(() => setLeague(null));
  }, [leagueId, status]);

  const isActive = (segment: string) => pathname.includes(`/leagues/${leagueId}/${segment}`);
  const isPicksActive =
    leagueId !== null &&
    !pathname.includes("/leaderboard") &&
    !pathname.includes("/admin") &&
    !pathname.includes("/settings") &&
    !pathname.includes("/slates");

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        {/* Left: wordmark + breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="text-base font-bold tracking-tight text-white shrink-0 hover:text-blue-400 transition-colors"
          >
            LockHub
          </Link>
          {league && (
            <>
              <span className="text-slate-600 hidden sm:block">/</span>
              <span className="text-sm font-medium text-slate-300 truncate hidden sm:block max-w-[180px]">
                {league.name}
              </span>
            </>
          )}
        </div>

        {/* Center: league tabs (desktop) */}
        {league && leagueId && (
          <nav className="hidden sm:flex items-center gap-1">
            <NavLink href={`/leagues/${leagueId}`} active={isPicksActive}>
              Picks
            </NavLink>
            <NavLink
              href={`/leagues/${leagueId}/leaderboard`}
              active={isActive("leaderboard")}
            >
              Leaderboard
            </NavLink>
            {league.role === "admin" && (
              <>
                <NavLink
                  href={`/leagues/${leagueId}/admin`}
                  active={isActive("admin")}
                >
                  Admin
                </NavLink>
                <NavLink
                  href={`/leagues/${leagueId}/settings`}
                  active={isActive("settings")}
                >
                  Settings
                </NavLink>
              </>
            )}
          </nav>
        )}

        {/* Right: user */}
        <div className="flex items-center gap-3 shrink-0">
          {status === "authenticated" && session?.user && (
            <>
              <Link
                href="/settings"
                className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors"
              >
                {session.user.name ?? session.user.email}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="hidden sm:block text-sm text-slate-500 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </>
          )}

          {/* Mobile hamburger */}
          {(league || status === "authenticated") && (
            <button
              className="sm:hidden p-2 text-slate-400 hover:text-white transition-colors"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-1">
          {league && leagueId && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {league.name}
              </p>
              <Link
                href={`/leagues/${leagueId}`}
                className={`block px-3 py-2 text-sm rounded-md ${isPicksActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                Picks
              </Link>
              <Link
                href={`/leagues/${leagueId}/leaderboard`}
                className={`block px-3 py-2 text-sm rounded-md ${isActive("leaderboard") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                Leaderboard
              </Link>
              {league.role === "admin" && (
                <>
                  <Link
                    href={`/leagues/${leagueId}/admin`}
                    className={`block px-3 py-2 text-sm rounded-md ${isActive("admin") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                  >
                    Admin
                  </Link>
                  <Link
                    href={`/leagues/${leagueId}/settings`}
                    className={`block px-3 py-2 text-sm rounded-md ${isActive("settings") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                  >
                    Settings
                  </Link>
                </>
              )}
              <div className="my-2 border-t border-slate-800" />
            </>
          )}
          {status === "authenticated" && session?.user && (
            <>
              <Link
                href="/settings"
                className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-md"
              >
                {session.user.name ?? session.user.email}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-md"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
