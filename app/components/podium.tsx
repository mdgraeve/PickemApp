"use client";

import Link from "next/link";

export type PodiumEntry = {
  rank: number;
  name: string | null;
  email: string;
  correct: number;
  totalPicks: number;
};

function displayName(entry: PodiumEntry): string {
  return entry.name ?? entry.email.split("@")[0];
}

function PixelFigure({ color }: { color: string }) {
  return (
    <svg
      width="60"
      height="70"
      viewBox="0 0 12 14"
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
    >
      {/* Arms raised in victory (same level as head) */}
      <rect x="1" y="0" width="2" height="4" fill={color} />
      <rect x="9" y="0" width="2" height="4" fill={color} />
      {/* Head */}
      <rect x="3" y="0" width="6" height="4" fill={color} />
      {/* Eyes */}
      <rect x="4" y="1" width="1" height="1" fill="#0f172a" />
      <rect x="7" y="1" width="1" height="1" fill="#0f172a" />
      {/* Smile */}
      <rect x="5" y="2" width="2" height="1" fill="#0f172a" />
      {/* Body */}
      <rect x="3" y="4" width="6" height="5" fill={color} />
      {/* Left leg */}
      <rect x="3" y="9" width="2" height="5" fill={color} />
      {/* Right leg */}
      <rect x="7" y="9" width="2" height="5" fill={color} />
    </svg>
  );
}

// Order: 2nd (left), 1st (center), 3rd (right) — classic Olympic arrangement
const PLACE_CONFIGS = [
  {
    rank: 2 as const,
    figColor: "#94a3b8",
    podiumHeight: "h-16",
    podiumFrom: "from-slate-500",
    podiumTo: "to-slate-600",
    podiumBorder: "border-slate-400",
    nameColor: "text-slate-300",
    scoreColor: "text-slate-400",
    numeral: "2",
  },
  {
    rank: 1 as const,
    figColor: "#f59e0b",
    podiumHeight: "h-24",
    podiumFrom: "from-yellow-600",
    podiumTo: "to-yellow-800",
    podiumBorder: "border-yellow-500",
    nameColor: "text-yellow-400",
    scoreColor: "text-yellow-300",
    numeral: "1",
  },
  {
    rank: 3 as const,
    figColor: "#b45309",
    podiumHeight: "h-10",
    podiumFrom: "from-orange-700",
    podiumTo: "to-orange-900",
    podiumBorder: "border-orange-600",
    nameColor: "text-orange-400",
    scoreColor: "text-orange-400",
    numeral: "3",
  },
];

export function PodiumDisplay({
  entries,
  leagueId,
}: {
  entries: PodiumEntry[];
  leagueId: string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Standings
        </p>
        <Link
          href={`/leagues/${leagueId}/leaderboard`}
          className="text-xs text-blue-400 hover:text-blue-300 transition"
        >
          Full leaderboard →
        </Link>
      </div>

      {/* Olympic-style podium: 2nd left, 1st center, 3rd right */}
      <div className="flex items-end justify-center gap-4">
        {PLACE_CONFIGS.map((cfg) => {
          const entry = entries.find((e) => e.rank === cfg.rank);

          return (
            <div key={cfg.rank} className="flex flex-col items-center w-24">
              {entry ? (
                <>
                  {/* Score above figure */}
                  <p className={`text-xs font-mono font-bold mb-1 ${cfg.scoreColor}`}>
                    {entry.correct}/{entry.totalPicks}
                  </p>
                  {/* Pixel art figure */}
                  <PixelFigure color={cfg.figColor} />
                  {/* Podium block */}
                  <div
                    className={`w-full ${cfg.podiumHeight} bg-gradient-to-b ${cfg.podiumFrom} ${cfg.podiumTo} border ${cfg.podiumBorder} flex items-start justify-center pt-1.5`}
                  >
                    <span className="text-sm font-bold font-mono text-white/80">
                      {cfg.numeral}
                    </span>
                  </div>
                  {/* Name below podium */}
                  <p className={`text-xs text-center mt-1.5 font-medium ${cfg.nameColor} w-full truncate`}>
                    {displayName(entry)}
                  </p>
                </>
              ) : (
                <>
                  {/* Empty slot */}
                  <div className="h-[70px] flex items-end justify-center pb-2 text-2xl text-slate-700">
                    ?
                  </div>
                  <div
                    className={`w-full ${cfg.podiumHeight} bg-gradient-to-b ${cfg.podiumFrom} ${cfg.podiumTo} border ${cfg.podiumBorder} flex items-start justify-center pt-1.5 opacity-30`}
                  >
                    <span className="text-sm font-bold font-mono text-white/80">
                      {cfg.numeral}
                    </span>
                  </div>
                  <p className="text-xs text-center mt-1.5 text-slate-600">—</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
