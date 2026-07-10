import type { ReactNode } from 'react';

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
    <div className="flex flex-col gap-4 mb-6 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/**
 * Horizontal-scroll container for wide data tables. On phones the table keeps
 * its natural column widths and scrolls sideways (with iOS momentum) instead of
 * squishing or bursting the viewport. Pass `minWidth` for tables with many
 * columns so they don't collapse into an unreadable width.
 */
export function TableScroll({
  children,
  minWidth,
  className = '',
}: {
  children: ReactNode;
  /** e.g. "min-w-[640px]" — applied to an inner wrapper so the table can't shrink below it. */
  minWidth?: string;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      {minWidth ? <div className={minWidth}>{children}</div> : children}
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
      className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 ${interactive}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
        {onClick && <span className="text-slate-300 text-base leading-none">→</span>}
      </div>
      <div className={`text-2xl sm:text-3xl font-bold mt-2 ${toneColor}`}>{value}</div>
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
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:overflow-y-auto sm:p-4"
      onClick={onClose}
    >
      {/*
       * Mobile: full-screen sheet (edge-to-edge, its own scroll) so the content
       * gets the whole viewport. sm+: a centered, rounded dialog. Mirrors the
       * `fullscreen="lg-down"` pattern from the avis_tools template.
       */}
      <div
        className="flex w-full max-w-4xl flex-col bg-white shadow-xl sm:my-8 sm:h-auto sm:max-h-[calc(100vh-4rem)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-6 pt-safe">
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
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{title}</h2>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-3xl leading-none shrink-0 -mt-1"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-safe">{children}</div>
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

export function Badge({ value, label }: { value: string; label?: string }) {
  // `value` drives the color tone (stable slug); `label` overrides the visible
  // text so callers can pass a translated role/status name without losing tone.
  const tone = BADGE_TONES[value] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${tone}`}>
      {label ?? value.replace('_', ' ')}
    </span>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="p-8 text-slate-400">{label}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-slate-400">{children}</div>;
}
