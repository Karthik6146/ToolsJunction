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

/**
 * Clockwise turn stored in a JPEG's EXIF Orientation tag (phone cameras save sideways pixels plus
 * this tag). Browsers apply it when showing the photo; PDF writers do not, so it must be added.
 * shortcut: mirrored orientations (2, 4, 5, 7) are treated as upright; they are rare from cameras.
 */
export function jpegRotation(b: Uint8Array): 0 | 90 | 180 | 270 {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 0;
  for (let i = 2; i + 10 < b.length && b[i] === 0xff;) {
    const marker = b[i + 1];
    if (marker === 0xda) break; // image data starts: no EXIF before it
    if (marker === 0xe1 && String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]) === 'Exif') {
      const t = i + 10; // TIFF header
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const ifd = t + (le ? u16(t + 4) | (u16(t + 6) << 16) : (u16(t + 4) << 16) | u16(t + 6));
      for (let k = 0, n = u16(ifd); k < n && ifd + 14 + k * 12 <= b.length; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) return ({ 3: 180, 6: 90, 8: 270 } as const)[u16(e + 8) as 3 | 6 | 8] ?? 0;
      }
      return 0;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 0;
}
