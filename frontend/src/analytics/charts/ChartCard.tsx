import { useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card } from '../../components/ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { exportCsv, exportPng } from '../export';
import { DataTable, EmptyChart } from './primitives';

/**
 * A titled card wrapping a single recharts chart. The fixed-height inner div is
 * mandatory: `ResponsiveContainer` measures its parent, and a parent with
 * `height:auto` (a flex/grid child) collapses to 0 and renders blank.
 *
 * When `exportRows` is supplied the header gains a "⤓ CSV" download and a
 * "⊞ Table" toggle that swaps the SVG chart for an accessible data table — the
 * screen-reader/keyboard fallback for the otherwise inaccessible chart.
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
  exportRows,
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
  /** Enables "⤓ CSV" download + "⊞ Table" accessible view over these rows. */
  exportRows?: { filename: string; rows: readonly object[] };
}): ReactElement {
  const isMobile = useIsMobile();
  const [showTable, setShowTable] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const h = height ?? (isMobile ? 220 : 280);
  const hasData = !!exportRows && exportRows.rows.length > 0;
  const chartVisible = !empty && !showTable;
  const ariaLabel = subtitle ? `${title}. ${subtitle}` : title;

  const downloadPng = () => {
    const svg = chartRef.current?.querySelector('svg');
    if (svg) exportPng(exportRows?.filename ?? title, svg as SVGSVGElement);
  };

  return (
    <Card className={`p-4 sm:p-5 ${full ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {hasData && (
            <button
              onClick={() => setShowTable((v) => !v)}
              className="text-xs font-semibold text-slate-400 hover:text-harmaal-blue transition"
              aria-pressed={showTable}
              title={showTable ? 'Show chart' : 'View as table'}
            >
              {showTable ? '◫ Chart' : '⊞ Table'}
            </button>
          )}
          {chartVisible && (
            <button
              onClick={downloadPng}
              className="text-xs font-semibold text-slate-400 hover:text-harmaal-blue transition"
              title="Download as PNG"
            >
              ⤓ PNG
            </button>
          )}
          {hasData && (
            <button
              onClick={() => exportCsv(exportRows.filename, exportRows.rows)}
              className="text-xs font-semibold text-slate-400 hover:text-harmaal-blue transition"
              title="Download as CSV"
            >
              ⤓ CSV
            </button>
          )}
          {action}
        </div>
      </div>
      <div style={{ width: '100%', height: h }}>
        {empty ? (
          <EmptyChart message={emptyMessage} />
        ) : showTable && exportRows ? (
          <DataTable rows={exportRows.rows} />
        ) : (
          <div ref={chartRef} role="img" aria-label={ariaLabel} style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
