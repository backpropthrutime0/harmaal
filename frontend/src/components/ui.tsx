import type { ReactNode } from 'react';

export function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Two-decimal variant for cash reconciliation, where cents must add up. */
export function money2(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  /** When provided, the card becomes an interactive button that opens a detail view. */
  onClick?: () => void;
}) {
  const toneColor =
    tone === 'good'
      ? 'text-green-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-red-600'
          : 'text-slate-900';
  const interactive = onClick
    ? 'cursor-pointer hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition'
    : '';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-100 ${interactive}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
        {onClick && <span className="text-slate-300 text-base leading-none">→</span>}
      </div>
      <div className={`text-3xl font-bold mt-2 ${toneColor}`}>{value}</div>
      {sub && <div className="text-sm text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

/** Centered overlay dialog. Backdrop click and the × button both close it. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  onBack,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: string;
  /** When set, shows a "← Back" control (for drill-down views). */
  onBack?: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="text-slate-400 hover:text-slate-700 text-sm font-semibold shrink-0"
              >
                ← Back
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 truncate">{title}</h2>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0 ml-4"
          >
            ×
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}>{children}</div>
  );
}

const BADGE_TONES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  open: 'bg-slate-100 text-slate-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  emergency: 'bg-red-100 text-red-700',
};

export function Badge({ value }: { value: string }) {
  const tone = BADGE_TONES[value] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${tone}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="p-8 text-slate-400">{label}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-slate-400">{children}</div>;
}
