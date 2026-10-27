export interface DimOpts { mode: 'px' | 'percent'; width?: number; height?: number; percent?: number; keepRatio: boolean }

export function fitDims(w: number, h: number, o: DimOpts): { w: number; h: number } {
  if (o.mode === 'percent') {
    const p = (o.percent ?? 100) / 100;
    return { w: Math.max(1, Math.round(w * p)), h: Math.max(1, Math.round(h * p)) };
  }
  let nw = o.width || 0;
  let nh = o.height || 0;
  if (o.keepRatio) {
    if (nw && !nh) nh = (h * nw) / w;
    else if (nh && !nw) nw = (w * nh) / h;
    else if (nw && nh) {
      const s = Math.min(nw / w, nh / h);
      nw = w * s;
      nh = h * s;
    }
  }
  return { w: Math.max(1, Math.round(nw || w)), h: Math.max(1, Math.round(nh || h)) };
}

export function loadImage(src: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read image (unsupported or corrupt file)'));
    img.src = url;
  });
}

export function drawToCanvas(img: CanvasImageSource, w: number, h: number, bg?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, quality));
}

/** JPEG/WEBP have no alpha; paint white under them so transparent areas don't turn black. */
export const needsBg = (type: string) => type !== 'image/png';

/**
 * Smallest blob not above targetBytes: binary-search quality, then shrink dimensions.
 * Returns the smallest result found if the target is unreachable.
 */
export async function fitToSize(c: HTMLCanvasElement, type: string, targetBytes: number): Promise<Blob> {
  let best: Blob | null = null;
  let cur = c;
  for (let shrink = 0; shrink < 7; shrink++) {
    if (type === 'image/png') {
      const b = await canvasToBlob(cur, type);
      if (!best || b.size < best.size) best = b;
      if (b.size <= targetBytes) return b;
    } else {
      let lo = 0.05, hi = 0.95, fit: Blob | null = null;
      for (let i = 0; i < 8; i++) {
        const q = (lo + hi) / 2;
        const b = await canvasToBlob(cur, type, q);
        if (!best || b.size < best.size) best = b;
        if (b.size <= targetBytes) { fit = b; lo = q; } else hi = q;
      }
      if (fit) return fit;
    }
    cur = drawToCanvas(cur, Math.max(1, Math.round(cur.width * 0.85)), Math.max(1, Math.round(cur.height * 0.85)));
  }
  return best!;
}

export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
