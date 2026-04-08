type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-800 ${className}`}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3">
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-3/5" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-800">
      <Skeleton className="h-4 w-8 shrink-0" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-10 shrink-0" />
      <Skeleton className="h-4 w-10 shrink-0" />
    </div>
  );
}

export function SkeletonGameCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 space-y-3">
      <Skeleton className="h-3 w-40" />
      <div className="flex gap-3">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[40vh]">
      <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
    </div>
  );
}
