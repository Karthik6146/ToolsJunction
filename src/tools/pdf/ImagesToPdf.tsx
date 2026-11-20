import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AddFiles, FileDrop, Segmented, Status, useRunner } from '../../components/ui';
import { PDF_TYPE, baseName, download, readBytes } from '../../lib/files';
import { imagesToPdf, layoutPage, type PageOpts } from '../../lib/pdf';
import { canvasToBlob, drawToCanvas, jpegRotation } from '../../lib/image';

/** w/h are the stored pixel size; exif is the camera's own turn, rot the user's. Both clockwise. */
type Item = { id: number; file: File; thumb: string; w: number; h: number; kind: 'jpg' | 'png' | 'other'; exif: number; rot: number };

const ACCEPT = 'image/*';
const THUMB = 480; // px on the long side: sharp enough for the preview, light on phone memory

function decode(f: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img, () => { throw new Error('Could not read this image (unsupported or damaged file)'); })
    .finally(() => URL.revokeObjectURL(url));
}

const kindOf = (f: File): Item['kind'] =>
  f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name) ? 'jpg' : f.type === 'image/png' || /\.png$/i.test(f.name) ? 'png' : 'other';

async function prepare(f: File, id: number): Promise<Item> {
  const img = await decode(f);
  const { naturalWidth: nw, naturalHeight: nh } = img; // already upright: browsers apply EXIF
  const k = Math.min(1, THUMB / Math.max(nw, nh));
  const c = drawToCanvas(img, Math.round(nw * k), Math.round(nh * k), '#fff');
  const thumb = URL.createObjectURL(await canvasToBlob(c, 'image/jpeg', 0.82));
  c.width = c.height = 0;
  const kind = kindOf(f);
  const exif = kind === 'jpg' ? jpegRotation(await readBytes(f.slice(0, 1 << 16))) : 0;
  const [w, h] = exif % 180 ? [nh, nw] : [nw, nh];
  return { id, file: f, thumb, w, h, kind, exif, rot: 0 };
}

/** Bytes pdf-lib can embed; other formats are decoded upright and re-encoded as JPEG. */
async function embeddable(it: Item) {
  if (it.kind !== 'other') return { bytes: await readBytes(it.file), type: it.kind, rotate: (it.exif + it.rot) % 360 };
  const img = await decode(it.file);
  const c = drawToCanvas(img, img.naturalWidth, img.naturalHeight, '#fff');
  const bytes = await readBytes(await canvasToBlob(c, 'image/jpeg', 0.92));
  c.width = c.height = 0;
  return { bytes, type: 'jpg' as const, rotate: it.rot };
}

const pct = (n: number) => `${n * 100}%`;
const CELL = 3 / 4; // width / height of every preview slot

/** One page drawn with the same layout the PDF uses, so what you see is what you download. */
function PagePreview({ it, o }: { it: Item; o: PageOpts }) {
  const L = layoutPage(it.w, it.h, (it.exif + it.rot) % 360, o);
  const a = L.pageW / L.pageH;
  const { clip: c, box: b } = L;
  // the thumbnail is upright already, so only the user's turn is applied to it
  const [iw, ih] = it.rot % 180 ? [b.h, b.w] : [b.w, b.h];
  return (
    <div className="pg" style={{ width: a > CELL ? '100%' : pct(a / CELL), height: a > CELL ? pct(CELL / a) : '100%' }}>
      <div className="pg-area" style={{ left: pct(c.x / L.pageW), top: pct(c.y / L.pageH), width: pct(c.w / L.pageW), height: pct(c.h / L.pageH) }}>
        <img
          src={it.thumb} alt="" draggable={false}
          style={{
            left: pct((b.x + b.w / 2 - c.x) / c.w), top: pct((b.y + b.h / 2 - c.y) / c.h),
            width: pct(iw / c.w), height: pct(ih / c.h), transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
          }}
        />
      </div>
    </div>
  );
}

const Ico = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ROTATE = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
const REMOVE = 'M6 6l12 12M18 6L6 18';
const GRIP = 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01';

export function ImagesToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [o, setO] = useState<PageOpts>({ pageSize: 'a4', orientation: 'auto', margin: 0, fill: false });
  const [drag, setDrag] = useState<number | null>(null);
  const nextId = useRef(1);
  const r = useRunner();
  const set = (p: Partial<PageOpts>) => setO((cur) => ({ ...cur, ...p }));

  // thumbnails are object URLs: release them when the tool closes
  const live = useRef(items);
  live.current = items;
  useEffect(() => () => live.current.forEach((it) => URL.revokeObjectURL(it.thumb)), []);

  // one at a time: decoding a dozen 12 MP photos at once can make a phone browser reload the page
  const add = (files: File[]) => r.run(async () => {
    for (const [i, f] of files.entries()) {
      r.setProgress(`Loading ${i + 1} of ${files.length}…`);
      const it = await prepare(f, nextId.current++);
      setItems((cur) => [...cur, it]);
    }
  });
  const patch = (id: number, fn: (it: Item) => Item | null) => setItems((cur) => cur.flatMap((it) => {
    if (it.id !== id) return [it];
    const next = fn(it);
    if (!next) URL.revokeObjectURL(it.thumb);
    return next ? [next] : [];
  }));
  const moveTo = (id: number, to: number) => setItems((cur) => {
    const from = cur.findIndex((it) => it.id === id);
    if (from < 0 || to < 0 || to >= cur.length || to === from) return cur;
    const a = [...cur];
    a.splice(to, 0, a.splice(from, 1)[0]);
    return a;
  });

  // reorder by dragging the grip: works with mouse, pen and touch (HTML drag and drop does not work on phones)
  const onGripDown = (e: PointerEvent<HTMLButtonElement>, id: number) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(id); };
  const onGripMove = (e: PointerEvent<HTMLButtonElement>, id: number) => {
    if (drag !== id) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-page]');
    if (el) moveTo(id, items.findIndex((it) => it.id === +el.dataset.page!));
  };
  // the grip's node moves in the DOM as pages reorder, which can drop its pointer capture: end the drag on any release
  useEffect(() => {
    if (drag === null) return;
    const end = () => setDrag(null);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    return () => { removeEventListener('pointerup', end); removeEventListener('pointercancel', end); };
  }, [drag]);
  const onGripKey =(e: KeyboardEvent, id: number, i: number) => {
    const d = ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 } as Record<string, number>)[e.key];
    if (d) { e.preventDefault(); moveTo(id, i + d); }
  };

  // pages glide to their new place after a reorder or delete (positions kept relative to the grid, so scrolling doesn't animate)
  const grid = useRef<HTMLDivElement>(null);
  const was = useRef(new Map<number, { x: number; y: number }>());
  useLayoutEffect(() => {
    const g = grid.current;
    if (!g) return;
    const base = g.getBoundingClientRect();
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const now = new Map<number, { x: number; y: number }>();
    for (const el of Array.from(g.querySelectorAll<HTMLElement>('[data-page]'))) {
      const rc = el.getBoundingClientRect();
      const p = { x: rc.left - base.left, y: rc.top - base.top };
      const prev = was.current.get(+el.dataset.page!);
      if (prev && !calm && (prev.x !== p.x || prev.y !== p.y))
        el.animate([{ transform: `translate(${prev.x - p.x}px, ${prev.y - p.y}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      now.set(+el.dataset.page!, p);
    }
    was.current = now;
  }, [items]);

  const convert = () => r.run(async () => {
    const imgs = [];
    for (const [i, it] of items.entries()) {
      r.setProgress(`Adding page ${i + 1} of ${items.length}…`);
      imgs.push(await embeddable(it));
    }
    r.setProgress('Saving PDF…');
    download(await imagesToPdf(imgs, o), items.length === 1 ? `${baseName(items[0].file.name)}.pdf` : 'images.pdf', PDF_TYPE);
  });

  if (!items.length) return <><FileDrop accept={ACCEPT} multiple onFiles={add} label="Select images" /><Status busy={r.busy} error={r.error} progress={r.progress} /></>;

  const mm = Math.round(o.margin * 0.3528);
  return (
    <div className="i2p">
      <aside className="i2p-opts panel">
        <Segmented label="Page size" value={o.pageSize} onChange={(v) => set({ pageSize: v })} options={[['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Image size']]} />
        {o.pageSize !== 'fit' && <>
          <Segmented label="Orientation" value={o.orientation} onChange={(v) => set({ orientation: v })} options={[['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
          <Segmented label="Image" value={o.fill ? 'fill' : 'fit'} onChange={(v) => set({ fill: v === 'fill' })} options={[['fit', 'Fit whole image'], ['fill', 'Fill page']]} />
        </>}
        <label className="field">
          <span className="field-label">White border<b className="field-value">{mm ? `${mm} mm` : 'None'}</b></span>
          <input type="range" min={0} max={72} step={4} value={o.margin} aria-label="White border around each image" onChange={(e) => set({ margin: +e.target.value })} />
        </label>
      </aside>

      <div className="i2p-main">
        <div className={`i2p-grid ${drag !== null ? 'dragging' : ''}`} ref={grid}>
          {items.map((it, i) => (
            <figure key={it.id} data-page={it.id} className={`i2p-card ${drag === it.id ? 'lifted' : ''}`}>
              <div className="i2p-slot"><PagePreview it={it} o={o} /></div>
              <figcaption>
                <button
                  className="i2p-btn grip" aria-label={`Move page ${i + 1}. Drag, or use arrow keys`} title="Drag to reorder"
                  onPointerDown={(e) => onGripDown(e, it.id)} onPointerMove={(e) => onGripMove(e, it.id)}
                  onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onKeyDown={(e) => onGripKey(e, it.id, i)}
                ><Ico d={GRIP} /></button>
                <span className="i2p-num">{i + 1}</span>
                <button className="i2p-btn" aria-label={`Rotate page ${i + 1}`} title="Rotate" onClick={() => patch(it.id, (x) => ({ ...x, rot: (x.rot + 90) % 360 }))}><Ico d={ROTATE} /></button>
                <button className="i2p-btn" aria-label={`Remove page ${i + 1}`} title="Remove" onClick={() => patch(it.id, () => null)}><Ico d={REMOVE} /></button>
              </figcaption>
            </figure>
          ))}
          <AddFiles accept={ACCEPT} onFiles={add} label="Add images" />
        </div>
        <Status busy={r.busy} error={r.error} progress={r.progress} />
      </div>

      <div className="i2p-bar">
        <span className="muted">{items.length} {items.length === 1 ? 'page' : 'pages'}</span>
        <button className="btn" disabled={r.busy} onClick={convert}>Convert to PDF</button>
      </div>
    </div>
  );
}
