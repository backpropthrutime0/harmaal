/** Trigger a browser download of a blob under `filename`. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Firefox/Safari don't cancel the in-flight download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Rasterize a chart's `<svg>` to a 2× PNG and download it — dependency-free
 * (serialize → data-URL → offscreen canvas). recharts uses inline fills/strokes,
 * so colors survive serialization; a solid background is painted first so the
 * PNG isn't transparent.
 */
export function exportPng(filename: string, svg: SVGSVGElement, background = '#ffffff'): void {
  const rect = svg.getBoundingClientRect();
  const width = Math.round(rect.width || Number(svg.getAttribute('width')) || 600);
  const height = Math.round(rect.height || Number(svg.getAttribute('height')) || 300);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (blob) download(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
    }, 'image/png');
  };
  img.src = src;
}

/** Serialize an array of flat objects to CSV and trigger a browser download. */
export function exportCsv(filename: string, rows: readonly object[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  download(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
