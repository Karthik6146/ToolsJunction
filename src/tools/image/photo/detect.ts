// Finds a circular photo slot (e.g. the round profile photo in a biodata) around a point, using only pixels.
// Approach: Sobel edge map on a downscaled copy, then score candidate circles by how much of their
// perimeter lies on edges (a cheap, local Hough-style search). Pure functions: testable without a DOM.

// scale: small px per design px; nx/ny: unit gradient direction at (dilated) edge pixels
export interface EdgeMap { w: number; h: number; scale: number; edge: Uint8Array; nx: Float32Array; ny: Float32Array }
export interface Circle { cx: number; cy: number; r: number; score: number }

const MAX_SIDE = 480;

/** Edge map from RGBA pixels (already downscaled by `scale`). Edges are dilated 1px so thin rings still score. */
export function edgeMap(rgba: Uint8ClampedArray, w: number, h: number, scale: number): EdgeMap {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const mag = new Float32Array(w * h), gxs = new Float32Array(w * h), gys = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      gxs[i] = gx; gys[i] = gy;
      mag[i] = Math.hypot(gx, gy);
      if (mag[i] > max) max = mag[i];
    }
  }
  const t = Math.max(40, max * 0.18);
  // dilate by 1px, carrying the direction of the strongest neighbour
  const edge = new Uint8Array(w * h), nx = new Float32Array(w * h), ny = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let best = -1, bm = t;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const j = (y + oy) * w + x + ox;
      if (mag[j] > bm) { bm = mag[j]; best = j; }
    }
    if (best < 0) continue;
    const i = y * w + x;
    edge[i] = 1; nx[i] = gxs[best] / bm; ny[i] = gys[best] / bm;
  }
  return { w, h, scale, edge, nx, ny };
}

/** Downscale size for a design of W×H so detection stays fast on slow PCs. */
export const detectScale = (W: number, H: number) => Math.min(1, MAX_SIDE / Math.max(W, H));

const N = 64; // perimeter samples per circle
const COS = Array.from({ length: N }, (_, i) => Math.cos((i / N) * Math.PI * 2));
const SIN = Array.from({ length: N }, (_, i) => Math.sin((i / N) * Math.PI * 2));

/** Share of perimeter samples sitting on an edge whose gradient points along the radius (a real round boundary). */
function score(m: EdgeMap, cx: number, cy: number, r: number): number {
  let hit = 0;
  for (let i = 0; i < N; i++) {
    const x = Math.round(cx + r * COS[i]), y = Math.round(cy + r * SIN[i]);
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0; // slot must be fully inside the design
    const j = y * m.w + x;
    if (m.edge[j] && Math.abs(m.nx[j] * COS[i] + m.ny[j] * SIN[i]) > 0.8) hit++;
  }
  return hit / N;
}

/**
 * Round photo slot containing design point (px, py), or null. The largest strong circle wins (so a face
 * inside the photo doesn't), and for a ring frame its inner edge, so the new photo sits inside the ring.
 */
export function detectCircle(m: EdgeMap, px: number, py: number, minScore = 0.72): Circle | null {
  const x0 = px * m.scale, y0 = py * m.scale;
  const rMax = Math.min(m.w, m.h) * 0.48;
  const found: Circle[] = [];
  for (let r = 10; r <= rMax; r += Math.max(1, r * 0.04)) {
    const step = Math.max(1, r / 7);
    let best: Circle | null = null;
    for (let dy = -0.85 * r; dy <= 0.85 * r; dy += step) {
      for (let dx = -0.85 * r; dx <= 0.85 * r; dx += step) {
        if (dx * dx + dy * dy > 0.72 * r * r) continue; // pointer well inside
        const s = score(m, x0 + dx, y0 + dy, r);
        if (s >= minScore - 0.15 && (!best || s > best.score)) best = { cx: x0 + dx, cy: y0 + dy, r, score: s };
      }
    }
    if (!best) continue;
    // refine centre and radius: hill-climb with shrinking steps until nothing improves
    for (let d = Math.max(1, step / 2); d >= 0.5; d /= 2) {
      for (let moved = true, n = 0; moved && n < 30; n++) {
        moved = false;
        for (const [ox, oy, or] of [[d, 0, 0], [-d, 0, 0], [0, d, 0], [0, -d, 0], [0, 0, d], [0, 0, -d], [d, d, 0], [-d, -d, 0], [d, -d, 0], [-d, d, 0]]) {
          const s = score(m, best.cx + ox, best.cy + oy, best.r + or);
          if (s > best.score) { best = { cx: best.cx + ox, cy: best.cy + oy, r: best.r + or, score: s }; moved = true; }
        }
      }
    }
    if (best.score >= minScore) found.push(best);
  }
  if (!found.length) return null;
  // the slot is the biggest round boundary (faces/objects inside the photo are smaller circles) ...
  const slot = found.reduce((a, b) => (b.r > a.r ? b : a));
  // ... unless it is the outer edge of a ring frame: then use the ring's inner edge, same centre, slightly smaller
  const ring = found
    .filter((c) => c !== slot && c.r >= slot.r * 0.85 && Math.hypot(c.cx - slot.cx, c.cy - slot.cy) < slot.r * 0.08)
    .sort((a, b) => a.r - b.r)[0];
  let pick = ring ?? slot;
  if (!ring) {
    // a ring's inner edge can have weak contrast against the photo: accept a fainter concentric circle
    for (let r = slot.r * 0.97; r >= slot.r * 0.82; r -= 0.5) {
      const s = score(m, slot.cx, slot.cy, r);
      if (s >= 0.45 && (pick === slot || s > pick.score)) pick = { cx: slot.cx, cy: slot.cy, r, score: s };
      else if (pick !== slot && s < 0.3) break; // past the inner edge
    }
  }
  return { cx: pick.cx / m.scale, cy: pick.cy / m.scale, r: pick.r / m.scale, score: pick.score };
}
