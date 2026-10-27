// Photo editor document model: layer types, drawing and hit testing. No React here.

export const ADJ = {
  brightness: { label: 'Brightness', min: 0, max: 200, def: 100, unit: '%' },
  contrast: { label: 'Contrast', min: 0, max: 200, def: 100, unit: '%' },
  saturate: { label: 'Saturation', min: 0, max: 300, def: 100, unit: '%' },
  'hue-rotate': { label: 'Hue', min: 0, max: 360, def: 0, unit: 'deg' },
  blur: { label: 'Blur', min: 0, max: 20, def: 0, unit: 'px' },
  grayscale: { label: 'Grayscale', min: 0, max: 100, def: 0, unit: '%' },
  sepia: { label: 'Sepia', min: 0, max: 100, def: 0, unit: '%' },
  invert: { label: 'Invert', min: 0, max: 100, def: 0, unit: '%' },
} as const;
export type AdjKey = keyof typeof ADJ;
export type Adj = Record<AdjKey, number>;
export const defaultAdj = () => Object.fromEntries(Object.entries(ADJ).map(([k, v]) => [k, v.def])) as Adj;
export const PRESETS: Record<string, Partial<Adj>> = {
  Original: {}, Vivid: { saturate: 160, contrast: 115 }, Mono: { grayscale: 100, contrast: 120 },
  Vintage: { sepia: 60, contrast: 90, brightness: 105 }, Cool: { 'hue-rotate': 190, saturate: 120 },
  Fade: { contrast: 80, brightness: 115, saturate: 70 }, Drama: { contrast: 150, saturate: 80, brightness: 95 },
  Warm: { sepia: 25, saturate: 130, brightness: 105 },
};
export const filterOf = (a: Partial<Adj>) =>
  (Object.keys(a) as AdjKey[]).filter((k) => a[k] !== ADJ[k].def).map((k) => `${k}(${a[k]}${ADJ[k].unit})`).join(' ') || 'none';

type Common = { id: number; x: number; y: number; w: number; h: number; rot: number; opacity: number; flipX?: boolean; flipY?: boolean; locked?: boolean };
export type TextL = Common & { kind: 'text'; text: string; font: string; size: number; color: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; stroke: string | null; shadow: boolean; bg: string | null };
export type Crop = { l: number; t: number; r: number; b: number }; // fractions trimmed from each side
export type ImageL = Common & { kind: 'image'; img: HTMLImageElement | HTMLCanvasElement; radius: number; crop: Crop; border: number; borderColor: string; fx: Partial<Adj> };
export type ShapeL = Common & { kind: 'shape'; shape: 'rect' | 'ellipse' | 'line' | 'arrow'; fill: string | null; stroke: string; strokeW: number; radius: number };
export type DrawL = Common & { kind: 'draw'; pts: [number, number][]; color: string; width: number; ow: number; oh: number };
export type Layer = TextL | ImageL | ShapeL | DrawL;
export type Look = { vignette: number; radius: number; border: number; borderColor: string };
export const LOOK0: Look = { vignette: 0, radius: 0, border: 0, borderColor: '#ffffff' };
export const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };

const srcSize = (img: ImageL['img']) => (img instanceof HTMLImageElement ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height]);
/** Height that keeps the cropped image's aspect ratio at width w. */
export const imageHeight = (l: Pick<ImageL, 'img' | 'crop'>, w: number) => {
  const [nw, nh] = srcSize(l.img);
  return (w * nh * (1 - l.crop.t - l.crop.b)) / (nw * (1 - l.crop.l - l.crop.r));
};

export const fontStr = (t: TextL) => `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size}px "${t.font}", sans-serif`;
export function fitText(t: TextL): TextL {
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = fontStr(t);
  const pad = t.size * 0.2;
  const lines = t.text.split('\n');
  return { ...t, w: Math.max(t.size, ...lines.map((l) => m.measureText(l).width)) + 2 * pad, h: lines.length * t.size * 1.25 + 2 * pad };
}

/** Draws a layer into its own box at 0,0..w,h (caller has translated/rotated/flipped). */
function drawLayer(ctx: CanvasRenderingContext2D, l: Layer) {
  if (l.kind === 'text') {
    const pad = l.size * 0.2;
    if (l.bg) { ctx.fillStyle = l.bg; ctx.beginPath(); ctx.roundRect(0, 0, l.w, l.h, l.size * 0.25); ctx.fill(); }
    ctx.font = fontStr(l);
    ctx.textBaseline = 'top';
    ctx.textAlign = l.align;
    const x = l.align === 'left' ? pad : l.align === 'center' ? l.w / 2 : l.w - pad;
    l.text.split('\n').forEach((line, i) => {
      const y = pad + i * l.size * 1.25;
      if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = l.size * 0.15; ctx.shadowOffsetY = l.size * 0.06; }
      if (l.stroke) { ctx.lineWidth = Math.max(1, l.size * 0.08); ctx.strokeStyle = l.stroke; ctx.lineJoin = 'round'; ctx.strokeText(line, x, y); }
      ctx.fillStyle = l.color;
      ctx.fillText(line, x, y);
      ctx.shadowColor = 'transparent';
    });
  } else if (l.kind === 'image') {
    const [nw, nh] = srcSize(l.img);
    const r = (l.radius / 100) * Math.min(l.w, l.h) / 2;
    ctx.beginPath(); ctx.roundRect(0, 0, l.w, l.h, r); ctx.clip();
    ctx.filter = filterOf(l.fx);
    ctx.drawImage(l.img, l.crop.l * nw, l.crop.t * nh, nw * (1 - l.crop.l - l.crop.r), nh * (1 - l.crop.t - l.crop.b), 0, 0, l.w, l.h);
    ctx.filter = 'none';
    if (l.border) { ctx.lineWidth = l.border * 2; ctx.strokeStyle = l.borderColor; ctx.beginPath(); ctx.roundRect(0, 0, l.w, l.h, r); ctx.stroke(); }
  } else if (l.kind === 'shape') {
    const s = l.strokeW;
    ctx.lineWidth = s; ctx.strokeStyle = l.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (l.shape === 'rect') ctx.roundRect(s / 2, s / 2, Math.max(1, l.w - s), Math.max(1, l.h - s), (l.radius / 100) * Math.min(l.w, l.h) / 2);
    else if (l.shape === 'ellipse') ctx.ellipse(l.w / 2, l.h / 2, Math.max(1, l.w / 2 - s / 2), Math.max(1, l.h / 2 - s / 2), 0, 0, Math.PI * 2);
    else {
      const head = l.shape === 'arrow' ? Math.min(l.w * 0.4, s * 4) : 0;
      ctx.moveTo(0, l.h / 2); ctx.lineTo(l.w - head * 0.6, l.h / 2);
      if (head) { ctx.stroke(); ctx.beginPath(); ctx.fillStyle = l.stroke; ctx.moveTo(l.w, l.h / 2); ctx.lineTo(l.w - head, l.h / 2 - head * 0.6); ctx.lineTo(l.w - head, l.h / 2 + head * 0.6); ctx.closePath(); ctx.fill(); return; }
    }
    if (l.fill && (l.shape === 'rect' || l.shape === 'ellipse')) { ctx.fillStyle = l.fill; ctx.fill(); }
    if (s > 0) ctx.stroke();
  } else {
    ctx.scale(l.w / l.ow, l.h / l.oh);
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
}

export function render(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, adj: Adj, layers: Layer[], look: Look, sel: Layer | null, scale: number) {
  const W = base.width, H = base.height;
  const corner = (look.radius / 100) * Math.min(W, H) / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (corner) { ctx.beginPath(); ctx.roundRect(0, 0, W, H, corner); ctx.clip(); }
  ctx.filter = filterOf(adj);
  ctx.drawImage(base, 0, 0);
  ctx.filter = 'none';
  if (look.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${look.vignette / 100})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (const l of layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2); ctx.rotate((l.rot * Math.PI) / 180);
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
    ctx.translate(-l.w / 2, -l.h / 2);
    drawLayer(ctx, l);
    ctx.restore();
  }
  if (look.border) {
    const b = (look.border / 100) * Math.min(W, H) * 0.15;
    ctx.lineWidth = b * 2; ctx.strokeStyle = look.borderColor;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, corner); ctx.stroke();
  }
  ctx.restore();
  if (sel) {
    ctx.save();
    ctx.translate(sel.x + sel.w / 2, sel.y + sel.h / 2); ctx.rotate((sel.rot * Math.PI) / 180); ctx.translate(-sel.w / 2, -sel.h / 2);
    ctx.setLineDash(sel.locked ? [] : [6 / scale, 4 / scale]); ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = sel.locked ? '#94a3b8' : '#3b82f6';
    ctx.strokeRect(0, 0, sel.w, sel.h);
    if (!sel.locked) {
      const s = 14 / scale;
      ctx.setLineDash([]); ctx.fillStyle = '#ffffff'; ctx.fillRect(sel.w - s / 2, sel.h - s / 2, s, s); ctx.strokeRect(sel.w - s / 2, sel.h - s / 2, s, s);
    }
    ctx.restore();
  }
}

/** Point in a layer's own (unrotated) box coordinates. */
export function toLocal(l: Layer, px: number, py: number): [number, number] {
  const a = (-l.rot * Math.PI) / 180, dx = px - (l.x + l.w / 2), dy = py - (l.y + l.h / 2);
  return [dx * Math.cos(a) - dy * Math.sin(a) + l.w / 2, dx * Math.sin(a) + dy * Math.cos(a) + l.h / 2];
}

export function solidCanvas(w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  if (color !== 'transparent') { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
  return c;
}

/**
 * Makes pixels close to the corner colour transparent, flood-filling from the edges so the
 * subject's own light areas survive. Good for logos, seals and signatures on plain backgrounds.
 */
export function removePlainBackground(src: ImageL['img'], tolerance: number): HTMLCanvasElement {
  const [w, h] = srcSize(src);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [r0, g0, b0] = [d[0], d[1], d[2]];
  const tol2 = (tolerance * 2.55) ** 2 * 3;
  const near = (i: number) => (d[i] - r0) ** 2 + (d[i + 1] - g0) ** 2 + (d[i + 2] - b0) ** 2 <= tol2;
  // each pixel is queued at most once, so the stack never exceeds w*h
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p: number) => { if (!seen[p]) { seen[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp];
    if (!near(p * 4)) continue;
    d[p * 4 + 3] = 0;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
