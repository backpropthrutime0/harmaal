/**
 * Even x-axis label thinning so long trends (up to 60 months) stay legible:
 * targets ~6 labels on phones, ~12 on desktop. `interval` is the number of
 * ticks to skip between labels (recharts convention).
 */
export function axisInterval(count: number, isMobile: boolean): number {
  const target = isMobile ? 6 : 12;
  return count > target ? Math.ceil(count / target) - 1 : 0;
}
