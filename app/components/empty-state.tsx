import Link from "next/link";

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: Action[];
};

export function EmptyState({ icon, title, description, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 text-slate-600 text-4xl">{icon}</div>
      )}
      <p className="text-base font-semibold text-white">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-400 max-w-sm">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions.map((action) => {
            const isPrimary = action.variant !== "secondary";
            const cls = isPrimary
              ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              : "rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800";

            if (action.href) {
              return (
                <Link key={action.label} href={action.href} className={cls}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={action.label} onClick={action.onClick} className={cls}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
