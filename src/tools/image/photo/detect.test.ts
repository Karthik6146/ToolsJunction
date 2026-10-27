import { detectCircle, edgeMap } from './detect';

/** White page with text-like noise and a ring frame (like a biodata photo slot) holding a busy photo. */
function page(w: number, h: number, ring: { cx: number; cy: number; r: number; t: number }) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number, v: number) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - ring.cx, y - ring.cy);
    const head = Math.hypot(x - ring.cx, y - (ring.cy - ring.r * 0.25));
    if (head <= ring.r * 0.35) set(x, y, 10); // a round "face" inside the photo must not win
    else if (d <= ring.r - ring.t) set(x, y, ((x >> 2) + (y >> 3)) % 2 ? 110 : 230); // photo: lots of inner edges
    else if (d <= ring.r) set(x, y, 20); // dark ring
    else if (y % 14 < 2 && x > ring.cx + ring.r + 10 && x % 9 < 6) set(x, y, 30); // "text" lines
  }
  return px;
}

describe('detectCircle', () => {
  const W = 300, H = 400, ring = { cx: 90, cy: 100, r: 60, t: 4 };
  const m = edgeMap(page(W, H, ring), W, H, 1);

  it('finds the slot inside the ring from a point near its centre', () => {
    const c = detectCircle(m, 92, 88)!; // pointer on the "face"
    expect(c).not.toBeNull();
    expect(Math.hypot(c.cx - ring.cx, c.cy - ring.cy)).toBeLessThan(3);
    // inner edge of the ring (r - t), not the outer one
    expect(Math.abs(c.r - (ring.r - ring.t))).toBeLessThan(3);
  });

  it('works on a downscaled map', () => {
    const k = 0.5, w = W * k, h = H * k;
    const small = new Uint8ClampedArray(w * h * 4);
    const big = page(W, H, ring);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) small[(y * w + x) * 4 + c] = big[((y * 2) * W + x * 2) * 4 + c];
    const c = detectCircle(edgeMap(small, w, h, k), 95, 95)!;
    expect(Math.hypot(c.cx - ring.cx, c.cy - ring.cy)).toBeLessThan(5);
  });

  it('returns null over text and blank areas', () => {
    expect(detectCircle(m, 250, 300)).toBeNull();
    expect(detectCircle(m, 200, 40)).toBeNull();
  });
});
