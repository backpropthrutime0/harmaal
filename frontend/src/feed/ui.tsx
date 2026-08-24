import type { ReactElement, ReactNode } from 'react';
import { Card } from '../components/ui';
import {
  EXPIRY_STATUS_LABEL,
  EXPIRY_STATUS_TONE,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  STOCK_STATUS_LABEL,
  STOCK_STATUS_TONE,
} from './constants';
import type { ExpiryStatus, MovementType, StockStatus } from './types';

/**
 * Small presentational pieces shared across the feed console.
 *
 * The property app's `Badge` keys its colour off rent/work-order statuses, so
 * the feed console gets its own typed pills rather than stringly-reusing that
 * lookup with values it has never heard of.
 */

function Pill({ tone, children }: { tone: string; children: ReactNode }): ReactElement {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {children}
    </span>
  );
}

export function StockPill({ status }: { status: StockStatus }): ReactElement {
  return <Pill tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Pill>;
}

export function ExpiryPill({ status }: { status: ExpiryStatus }): ReactElement {
  return <Pill tone={EXPIRY_STATUS_TONE[status]}>{EXPIRY_STATUS_LABEL[status]}</Pill>;
}

export function MovementPill({ type }: { type: MovementType }): ReactElement {
  return <Pill tone={MOVEMENT_TONE[type]}>{MOVEMENT_LABEL[type]}</Pill>;
}

/**
 * A headline metric. `tone` colours the value, `hint` carries the secondary
 * figure that gives the headline meaning (a share, a comparison, a count).
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  icon?: string;
  /** When set the tile becomes a button that drills into the detail behind it. */
  onClick?: () => void;
}): ReactElement {
  const toneColor = {
    default: 'text-slate-900',
    good: 'text-green-700',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  }[tone];

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        {icon && (
          <span className="text-base leading-none" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold sm:text-3xl ${toneColor}`}>{value}</div>
      {hint && <div className="mt-1 text-sm text-slate-400">{hint}</div>}
    </>
  );

  if (!onClick) {
    return <Card className="p-4 sm:p-6">{content}</Card>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#6aa84f]/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6aa84f] sm:p-6"
    >
      {content}
    </button>
  );
}

/** A titled block with an optional action in the header. */
export function Section({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-800 sm:text-base">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Inline error banner for a failed fetch or submit. */
export function ErrorBanner({ message }: { message: string }): ReactElement {
  return (
    <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

/** Primary action button in the feed console's green. */
export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}): ReactElement {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl bg-[#3f7d3f] px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#356b35] disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/** Shared input styling so every feed form field looks the same. */
export const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6aa84f]';

/** Label + control pair used throughout the feed forms. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
