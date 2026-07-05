import type { ReactElement } from 'react';
import { money } from '../../format';

/**
 * Minimal, version-stable tooltip prop shape. Recharts passes `active`,
 * `label`, and a `payload` array to custom tooltip content; typing our own
 * interface avoids coupling to recharts' internal generics while staying strict.
 */
export interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}
export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadItem[];
  /**
   * Optional label transform. Recharts' own `labelFormatter` is ignored when a
   * custom `content` element is supplied, so we thread formatting through here
   * instead (recharts preserves props already on the content element).
   */
  labelFormat?: (label: string) => string;
}

function TooltipShell({
  label,
  labelFormat,
  children,
}: {
  label?: string | number;
  labelFormat?: (label: string) => string;
  children: ReactElement | ReactElement[];
}) {
  const shown = label !== undefined && label !== '' ? (labelFormat ? labelFormat(String(label)) : label) : '';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {shown !== '' && <div className="font-semibold text-slate-700 mb-1">{shown}</div>}
      {children}
    </div>
  );
}

function Rows({ payload, format }: { payload: TooltipPayloadItem[]; format: (v: number) => string }) {
  return (
    <>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="capitalize">{String(p.name ?? '').replace(/_/g, ' ')}</span>
          <span className="ml-auto font-semibold text-slate-800">
            {typeof p.value === 'number' ? format(p.value) : p.value}
          </span>
        </div>
      ))}
    </>
  );
}

/** Tooltip that formats every numeric series as currency. */
export function MoneyTooltip({ active, label, payload, labelFormat }: ChartTooltipProps): ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell label={label} labelFormat={labelFormat}>
      <Rows payload={payload} format={money} />
    </TooltipShell>
  );
}

/** Tooltip that formats numeric series as whole percentages. */
export function PercentTooltip({ active, label, payload, labelFormat }: ChartTooltipProps): ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell label={label} labelFormat={labelFormat}>
      <Rows payload={payload} format={(v) => `${Math.round(v)}%`} />
    </TooltipShell>
  );
}

/** Tooltip that formats numeric series as plain counts. */
export function CountTooltip({ active, label, payload, labelFormat }: ChartTooltipProps): ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell label={label} labelFormat={labelFormat}>
      <Rows payload={payload} format={(v) => `${v}`} />
    </TooltipShell>
  );
}

/** Fallback shown in place of a chart when a filter yields no data. */
export function EmptyChart({ message = 'No data for this selection.' }: { message?: string }): ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">{message}</div>
  );
}
