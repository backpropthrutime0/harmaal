import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card } from '../../components/ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { EmptyChart } from './primitives';

/**
 * A titled card wrapping a single recharts chart. The fixed-height inner div is
 * mandatory: `ResponsiveContainer` measures its parent, and a parent with
 * `height:auto` (a flex/grid child) collapses to 0 and renders blank.
 *
 * `children` must be a single recharts chart element (e.g. `<BarChart>…`).
 */
export function ChartCard({
  title,
  subtitle,
  children,
  height,
  full,
  action,
  empty,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  children: ReactElement;
  /** Chart height in px; defaults to 280 (desktop) / 220 (mobile). */
  height?: number;
  /** Span both columns of the section grid (for wide trend charts). */
  full?: boolean;
  /** Optional control rendered in the header (e.g. a small toggle). */
  action?: ReactNode;
  /** When true, render an empty-state message instead of the chart. */
  empty?: boolean;
  emptyMessage?: string;
}): ReactElement {
  const isMobile = useIsMobile();
  const h = height ?? (isMobile ? 220 : 280);
  return (
    <Card className={`p-4 sm:p-5 ${full ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div style={{ width: '100%', height: h }}>
        {empty ? (
          <EmptyChart message={emptyMessage} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
