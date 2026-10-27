import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileDrop, Field, Segmented, Status, Toggle, useRunner } from '../../components/ui';
import { baseName, download } from '../../lib/files';
import { EXT, canvasToBlob, loadImage } from '../../lib/image';
import { rotateFlip } from './ImageTools';
import {
  ADJ, LOOK0, NO_CROP, PRESETS, defaultAdj, fitText, imageHeight, removePlainBackground, render, solidCanvas, toLocal,
  type Adj, type AdjKey, type DrawL, type ImageL, type Layer, type Look, type ShapeL,
} from './photo/model';
import { deleteUpload, fileToImages, listUploads, saveUpload, type Upload } from './photo/uploads';

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Trebuchet MS', 'Verdana', 'Comic Sans MS', 'Segoe Script', 'Segoe UI'];
const STICKERS = ['⭐', '❤️', '🔥', '✅', '🎉', '😀', '👍', '📍', '💡', '⚡', '🌸', '🎁'];
const SIZES: [string, number, number][] = [
  ['A4 document', 1240, 1754], ['Instagram post', 1080, 1080], ['Instagram story', 1080, 1920],
  ['Presentation', 1920, 1080], ['YouTube thumbnail', 1280, 720], ['Poster', 1800, 2400],
];
const IMAGE_FX: AdjKey[] = ['brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'blur'];
type Tab = 'uploads' | 'text' | 'elements' | 'draw' | 'adjust' | 'frame';
let uid = 1;

const newImageLayer = (img: ImageL['img'], W: number, H: number, cx = W / 2, cy = H / 2): ImageL => {
  const nw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const nh = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const w = Math.min(W * 0.5, nw), h = (w * nh) / nw;
  return { id: uid++, kind: 'image', img, x: cx - w / 2, y: cy - h / 2, w, h, rot: 0, opacity: 1, radius: 0, crop: NO_CROP, border: 0, borderColor: '#ffffff', fx: {} };
};

function StartScreen({ onPhoto, onBlank, busy, error }: { onPhoto: (f: File) => void; onBlank: (w: number, h: number, bg: string) => void; busy: boolean; error: string }) {
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const [bg, setBg] = useState('#ffffff');
  return (
    <div className="start-grid">
      <div>
        <h3>Edit a photo</h3>
        <FileDrop accept="image/*,.pdf,application/pdf" onFiles={(f) => onPhoto(f[0])} label="Open image or PDF" />
      </div>
      <div className="panel" style={{ marginTop: 0, alignContent: 'start' }}>
        <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>Or start a blank design</h3>
        {SIZES.map(([n, sw, sh]) => (
          <button key={n} className="size-card" onClick={() => onBlank(sw, sh, bg)}>
            <span className="size-thumb" style={{ aspectRatio: `${sw} / ${sh}` }} />
            <b>{n}</b><span className="muted">{sw} × {sh}</span>
          </button>
        ))}
        <Field label="Width (px)"><input type="number" min={50} max={8000} value={w} onChange={(e) => setW(+e.target.value)} /></Field>
        <Field label="Height (px)"><input type="number" min={50} max={8000} value={h} onChange={(e) => setH(+e.target.value)} /></Field>
        <Field label="Background"><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
        <button className="btn" onClick={() => onBlank(Math.min(8000, Math.max(50, w)), Math.min(8000, Math.max(50, h)), bg)}>Create custom size</button>
      </div>
      <Status busy={busy} error={error} />
    </div>
  );
}

export function ImageEditor() {
  const [name, setName] = useState('design');
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [blankBg, setBlankBg] = useState<string | null>(null); // set when the design started blank
  const [adj, setAdj] = useState(defaultAdj);
  const [look, setLook] = useState<Look>(LOOK0);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [past, setPast] = useState<Layer[][]>([]);
  const [future, setFuture] = useState<Layer[][]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('uploads');
  const [ink, setInk] = useState('#ff3b30');
  const [inkW, setInkW] = useState(8);
  const [fmt, setFmt] = useState('image/png');
  const [zoom, setZoom] = useState(1);
  const [fitW, setFitW] = useState(800);
  const [ups, setUps] = useState<(Upload & { url: string })[]>([]);
  const [tol, setTol] = useState(18);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ kind: 'move' | 'resize' | 'draw'; start: Layer; px: number; py: number } | null>(null);
  const { busy, error, setError, run } = useRunner();
  const drawing = tab === 'draw';

  const sel = layers.find((l) => l.id === selId) ?? null;
  const W = base?.width ?? 1, H = base?.height ?? 1;
  const scale = () => (canvas.current ? canvas.current.clientWidth / W : 1);

  // uploads library (kept in this browser)
  useEffect(() => {
    listUploads().then((list) => setUps(list.map((u) => ({ ...u, url: URL.createObjectURL(u.blob) }))));
  }, []);
  useEffect(() => () => ups.forEach((u) => URL.revokeObjectURL(u.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (c: HTMLCanvasElement, bg: string | null, n: string) => {
    setBase(c); setBlankBg(bg); setName(n); setAdj(defaultAdj()); setLook(LOOK0);
    setLayers([]); setPast([]); setFuture([]); setSelId(null); setZoom(1);
  };
  const openPhoto = (f: File) => run(async () => {
    const [first] = await fileToImages(f);
    const img = await loadImage(first.blob);
    start(rotateFlip(img, 0, false, false), null, baseName(f.name));
  });

  // fit the design to the stage; zoom multiplies it
  useEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (!el || !base) return;
      setFitW(Math.max(120, Math.min(el.clientWidth - 32, (window.innerHeight * 0.72 * base.width) / base.height)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [base]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.2, Math.round(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1) * 100) / 100)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [base]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    render(c.getContext('2d')!, base, adj, layers, look, drawing ? null : sel, scale());
  });

  // history: layers only; adjustments and frame are plain settings
  const snapshot = () => { setPast((p) => [...p.slice(-49), layers]); setFuture([]); };
  const commit = (next: Layer[]) => { snapshot(); setLayers(next); };
  const undo = () => { if (!past.length) return; setFuture((f) => [layers, ...f]); setLayers(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, layers]); setLayers(future[0]); setFuture((f) => f.slice(1)); };
  const patch = (p: Partial<Layer>) => {
    if (!sel) return;
    const next = { ...sel, ...p } as Layer;
    commit(layers.map((l) => (l.id === sel.id ? (next.kind === 'text' ? fitText(next) : next) : l)));
  };
  const add = (l: Layer) => { commit([...layers, l]); setSelId(l.id); if (tab === 'draw') setTab('elements'); };
  const remove = () => { if (sel) { commit(layers.filter((l) => l.id !== sel.id)); setSelId(null); } };
  const duplicate = () => { if (sel) add({ ...sel, id: uid++, locked: false, x: sel.x + W * 0.03, y: sel.y + W * 0.03 }); };
  const reorder = (dir: 1 | -1 | 'top' | 'bottom') => {
    if (!sel) return;
    const rest = layers.filter((l) => l !== sel);
    const i = layers.indexOf(sel);
    const j = dir === 'top' ? rest.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(rest.length, i + dir));
    commit([...rest.slice(0, j), sel, ...rest.slice(j)]);
  };
  const align = (where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!sel) return;
    patch({ left: { x: 0 }, center: { x: (W - sel.w) / 2 }, right: { x: W - sel.w }, top: { y: 0 }, middle: { y: (H - sel.h) / 2 }, bottom: { y: H - sel.h } }[where]);
  };
  const fillPage = () => {
    if (sel?.kind !== 'image') return;
    const ratio = imageHeight(sel, 1);
    const w = Math.max(W, H / ratio), h = w * ratio;
    patch({ w, h, x: (W - w) / 2, y: (H - h) / 2, rot: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!base || ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remove(); }
      else if (e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.ctrlKey && k === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey && k === 'd' && sel) { e.preventDefault(); duplicate(); }
      else if (e.key === 'Escape') setSelId(null);
      else if (sel && !sel.locked && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        patch({ x: sel.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), y: sel.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addText = (kind: 'heading' | 'sub' | 'body') => {
    const size = Math.round(Math.min(W, H * 1.4) * { heading: 0.08, sub: 0.05, body: 0.032 }[kind]);
    const dark = blankBg !== null && blankBg !== 'transparent' && parseInt(blankBg.slice(1), 16) > 0x888888;
    const t = fitText({ id: uid++, kind: 'text', x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1, text: { heading: 'Add a heading', sub: 'Add a subheading', body: 'Add a little bit of body text' }[kind], font: kind === 'heading' ? 'Impact' : 'Arial', size, color: dark ? '#111111' : '#ffffff', bold: kind !== 'heading', italic: false, align: 'center', stroke: kind === 'heading' && !dark ? '#000000' : null, shadow: !dark, bg: null });
    add({ ...t, x: (W - t.w) / 2, y: (H - t.h) / 2 });
    setTimeout(() => textBox.current?.select(), 0);
  };
  const addShape = (shape: ShapeL['shape']) => {
    const s = Math.min(W, H);
    const w = s * 0.3, h = shape === 'line' || shape === 'arrow' ? Math.max(20, s * 0.04) : s * 0.3;
    add({ id: uid++, kind: 'shape', shape, x: (W - w) / 2, y: (H - h) / 2, w, h, rot: 0, opacity: 1, fill: shape === 'rect' || shape === 'ellipse' ? '#ffffff' : null, stroke: '#e5322d', strokeW: Math.max(2, Math.round(s * 0.006)), radius: 0 });
  };
  const addSticker = (s: string) => {
    const t = fitText({ id: uid++, kind: 'text', x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1, text: s, font: 'Segoe UI Emoji', size: Math.round(Math.min(W, H) * 0.12), color: '#000000', bold: false, italic: false, align: 'center', stroke: null, shadow: false, bg: null });
    add({ ...t, x: (W - t.w) / 2, y: (H - t.h) / 2 });
  };

  /** Saves files to Uploads; returns the new uploads so a drop can place the first one. */
  const upload = async (files: File[]) => {
    const added: (Upload & { url: string })[] = [];
    for (const f of files) {
      for (const part of await fileToImages(f)) {
        const id = await saveUpload(part.name, part.blob);
        added.push({ id, name: part.name, blob: part.blob, added: Date.now(), url: URL.createObjectURL(part.blob) });
      }
    }
    setUps((u) => [...[...added].reverse(), ...u]);
    return added;
  };
  const placeUpload = (u: Upload, cx?: number, cy?: number) => run(async () => add(newImageLayer(await loadImage(u.blob), W, H, cx, cy)));
  const removeUpload = (u: Upload & { url: string }) => { deleteUpload(u.id); URL.revokeObjectURL(u.url); setUps((list) => list.filter((x) => x.id !== u.id)); };

  const pt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onDown = (e: React.PointerEvent) => {
    const [px, py] = pt(e);
    canvas.current!.setPointerCapture(e.pointerId);
    if (drawing) {
      const l: DrawL = { id: uid++, kind: 'draw', x: 0, y: 0, w: W, h: H, ow: W, oh: H, rot: 0, opacity: 1, pts: [[px, py]], color: ink, width: inkW };
      snapshot();
      setLayers([...layers, l]);
      drag.current = { kind: 'draw', start: l, px, py };
      return;
    }
    const tol = 8 / scale();
    if (sel && !sel.locked) {
      const [lx, ly] = toLocal(sel, px, py);
      if (Math.abs(lx - sel.w) < 2 * tol && Math.abs(ly - sel.h) < 2 * tol) { snapshot(); drag.current = { kind: 'resize', start: sel, px, py }; return; }
    }
    const hit = [...layers].reverse().find((l) => { const [lx, ly] = toLocal(l, px, py); return lx > -tol && ly > -tol && lx < l.w + tol && ly < l.h + tol; });
    setSelId(hit?.id ?? null);
    if (hit && !hit.locked) { snapshot(); drag.current = { kind: 'move', start: hit, px, py }; }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [px, py] = pt(e);
    setLayers((ls) => ls.map((l) => {
      if (l.id !== d.start.id) return l;
      if (d.kind === 'draw' && l.kind === 'draw') return { ...l, pts: [...l.pts, [px, py]] };
      if (d.kind === 'move') return { ...l, x: d.start.x + px - d.px, y: d.start.y + py - d.py };
      // shortcut: resize keeps the box's unrotated top-left fixed, so rotated layers drift a little while resizing
      const [lx, ly] = toLocal(d.start, px, py);
      const w = Math.max(10, lx);
      if (l.kind === 'text' && d.start.kind === 'text') return fitText({ ...l, size: Math.max(6, Math.round(d.start.size * (w / d.start.w))) });
      const keepRatio = l.kind === 'image' || l.kind === 'draw';
      return { ...l, w, h: keepRatio ? (w * d.start.h) / d.start.w : Math.max(4, ly) };
    }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind !== 'draw') return;
    // shrink the stroke's box to its ink so it can be selected and moved like any layer
    setLayers((ls) => ls.map((l) => {
      if (l.id !== d.start.id || l.kind !== 'draw') return l;
      const xs = l.pts.map((p) => p[0]), ys = l.pts.map((p) => p[1]), m = l.width;
      const x = Math.min(...xs) - m, y = Math.min(...ys) - m, w = Math.max(...xs) - x + m, h = Math.max(...ys) - y + m;
      return { ...l, x, y, w, h, ow: w, oh: h, pts: l.pts.map(([a, b]) => [a - x, b - y] as [number, number]) };
    }));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const [cx, cy] = pt(e);
    const id = e.dataTransfer.getData('text/tj-upload');
    if (id) { const u = ups.find((x) => String(x.id) === id); if (u) placeUpload(u, cx, cy); return; }
    const files = [...e.dataTransfer.files];
    if (files.length) run(async () => { const added = await upload(files); for (const u of added.slice(0, 5)) add(newImageLayer(await loadImage(u.blob), W, H, cx, cy)); });
  };

  const exportCanvas = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    render(c.getContext('2d')!, base!, adj, layers, look, null, 1);
    if (fmt === 'image/png') return c;
    const out = solidCanvas(W, H, '#ffffff'); // JPG/WEBP have no transparency
    out.getContext('2d')!.drawImage(c, 0, 0);
    return out;
  };
  const save = () => run(async () => download(await canvasToBlob(exportCanvas(), fmt, 0.92), `${name}-edited.${EXT[fmt]}`));
  // rotating the whole design bakes everything (layers, filters, frame) into a new base
  const transform = (deg: number, h: boolean, v: boolean) => {
    const flat = exportCanvas();
    start(rotateFlip(Object.assign(flat, { naturalWidth: flat.width, naturalHeight: flat.height }), deg, h, v), blankBg, name);
  };

  if (!base) return <StartScreen onPhoto={openPhoto} onBlank={(w, h, bg) => start(solidCanvas(w, h, bg), bg, 'design')} busy={busy} error={error} />;

  const color = (label: string, value: string, on: (v: string) => void) => <Field label={label}><input type="color" value={value} onChange={(e) => on(e.target.value)} /></Field>;
  const range = (label: string, value: number, min: number, max: number, on: (v: number) => void, unit = '') => (
    <Field label={label} value={`${Math.round(value)}${unit}`}><input type="range" min={min} max={max} value={value} onChange={(e) => on(+e.target.value)} /></Field>
  );
  const shown = fitW * zoom, s = shown / W;
  const iconBtn = (label: string, icon: ReactNode, on: () => void, active = false) => (
    <button className={`fbtn ${active ? 'on' : ''}`} title={label} aria-label={label} onPointerDown={(e) => e.stopPropagation()} onClick={on}>{icon}</button>
  );

  return (
    <div className="editor-wrap">
      <input ref={uploadInput} type="file" accept="image/*,.pdf,application/pdf" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; run(async () => { await upload(f); }); }} />
      <input ref={replaceInput} type="file" accept="image/*,.pdf,application/pdf" hidden onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (f && sel?.kind === 'image') run(async () => { const [u] = await upload([f]); const img = await loadImage(u.blob); patch({ img, crop: NO_CROP, h: imageHeight({ img, crop: NO_CROP }, sel.w) }); });
      }} />
      <div className="toolbar">
        <Segmented label="Tools" value={tab} onChange={setTab}
          options={[['uploads', 'Uploads'], ['text', 'Text'], ['elements', 'Elements'], ['draw', 'Draw'], ['adjust', 'Adjust'], ['frame', 'Page']]} />

        {tab === 'uploads' && <>
          <button className="btn" onClick={() => uploadInput.current?.click()}>⬆ Upload files</button>
          <span className="muted">Images, SVG and PDFs (each page becomes an image). Saved in this browser only. Click or drag onto the design.</span>
          <div className="upload-grid">
            {ups.map((u) => (
              <div key={u.id} className="upload-item" draggable onDragStart={(e) => e.dataTransfer.setData('text/tj-upload', String(u.id))}>
                <button className="upload-thumb" onClick={() => placeUpload(u)} title={`Add ${u.name}`}><img src={u.url} alt={u.name} loading="lazy" /></button>
                <button className="upload-del" onClick={() => removeUpload(u)} aria-label={`Remove ${u.name} from uploads`}>✕</button>
              </div>
            ))}
          </div>
          {!ups.length && <span className="muted">No uploads yet.</span>}
        </>}

        {tab === 'text' && <>
          <button className="btn sm ghost" style={{ fontSize: 17, fontWeight: 800 }} onClick={() => addText('heading')}>Add a heading</button>
          <button className="btn sm ghost" style={{ fontWeight: 700 }} onClick={() => addText('sub')}>Add a subheading</button>
          <button className="btn sm ghost" onClick={() => addText('body')}>Add body text</button>
        </>}

        {tab === 'elements' && <>
          <b>Shapes</b>
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => addShape('rect')}>▭ Box</button>
            <button className="btn sm ghost" onClick={() => addShape('ellipse')}>◯ Circle</button>
            <button className="btn sm ghost" onClick={() => addShape('line')}>— Line</button>
            <button className="btn sm ghost" onClick={() => addShape('arrow')}>→ Arrow</button>
          </div>
          <b>Stickers</b>
          <div className="sticker-grid">{STICKERS.map((x) => <button key={x} onClick={() => addSticker(x)} aria-label={`Add ${x}`}>{x}</button>)}</div>
        </>}

        {tab === 'draw' && <>
          <span className="muted">Draw on the design. Each stroke becomes a layer you can move.</span>
          {color('Brush color', ink, setInk)}
          {range('Brush size', inkW, 1, Math.max(40, Math.round(W / 30)), setInkW)}
        </>}

        {tab === 'adjust' && <>
          <b>Filters (whole design)</b>
          <div className="chip-grid">{Object.entries(PRESETS).map(([n, p]) => <button key={n} className="btn sm ghost" onClick={() => setAdj({ ...defaultAdj(), ...p })}>{n}</button>)}</div>
          {(Object.keys(ADJ) as AdjKey[]).map((k) => range(ADJ[k].label, adj[k], ADJ[k].min, ADJ[k].max, (v) => setAdj({ ...adj, [k]: v }), ADJ[k].unit === 'deg' ? '°' : ADJ[k].unit))}
        </>}

        {tab === 'frame' && <>
          {blankBg !== null && <>
            <Field label="Background color"><input type="color" value={blankBg === 'transparent' ? '#ffffff' : blankBg} onChange={(e) => { setBlankBg(e.target.value); setBase(solidCanvas(W, H, e.target.value)); }} /></Field>
            <Toggle label="Transparent background" checked={blankBg === 'transparent'} onChange={(v) => { const c = v ? 'transparent' : '#ffffff'; setBlankBg(c); setBase(solidCanvas(W, H, c)); }} />
          </>}
          {range('Vignette', look.vignette, 0, 90, (v) => setLook({ ...look, vignette: v }), '%')}
          {range('Rounded corners', look.radius, 0, 100, (v) => setLook({ ...look, radius: v }), '%')}
          {range('Border', look.border, 0, 100, (v) => setLook({ ...look, border: v }), '%')}
          {look.border > 0 && color('Border color', look.borderColor, (v) => setLook({ ...look, borderColor: v }))}
          <b>Rotate & flip page</b>
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => transform(270, false, false)}>⟲ 90°</button>
            <button className="btn sm ghost" onClick={() => transform(90, false, false)}>⟳ 90°</button>
            <button className="btn sm ghost" onClick={() => transform(0, true, false)}>⇋ Flip</button>
            <button className="btn sm ghost" onClick={() => transform(0, false, true)}>⇵ Flip</button>
          </div>
          <span className="muted">Rotating the page merges all layers into it.</span>
        </>}

        {sel && <div className="layer-panel">
          <b>Selected {sel.kind === 'draw' ? 'drawing' : sel.kind}{sel.locked ? ' (locked)' : ''}</b>
          {sel.kind === 'text' && <>
            <textarea ref={textBox} style={{ minHeight: 70 }} value={sel.text} onChange={(e) => patch({ text: e.target.value })} />
            <Field label="Font"><select value={sel.font} onChange={(e) => patch({ font: e.target.value })}>{[...new Set([sel.font, ...FONTS])].map((f) => <option key={f} style={{ fontFamily: f }}>{f}</option>)}</select></Field>
            {range('Size', sel.size, 6, Math.round(Math.max(W, H) / 3), (v) => patch({ size: v }))}
            {color('Color', sel.color, (v) => patch({ color: v }))}
            <div className="chip-grid">
              <button className={`btn sm ghost ${sel.bold ? 'on' : ''}`} onClick={() => patch({ bold: !sel.bold })}><b>B</b></button>
              <button className={`btn sm ghost ${sel.italic ? 'on' : ''}`} onClick={() => patch({ italic: !sel.italic })}><i>I</i></button>
              {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={`btn sm ghost ${sel.align === a ? 'on' : ''}`} onClick={() => patch({ align: a })}>{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</button>)}
            </div>
            <Toggle label="Outline" checked={!!sel.stroke} onChange={(v) => patch({ stroke: v ? '#000000' : null })} />
            {sel.stroke && color('Outline color', sel.stroke, (v) => patch({ stroke: v }))}
            <Toggle label="Shadow" checked={sel.shadow} onChange={(v) => patch({ shadow: v })} />
            <Toggle label="Background" checked={!!sel.bg} onChange={(v) => patch({ bg: v ? '#000000' : null })} />
            {sel.bg && color('Background color', sel.bg, (v) => patch({ bg: v }))}
          </>}
          {sel.kind === 'image' && <ImageControls sel={sel} patch={patch} range={range} color={color} tol={tol} setTol={setTol} onReplace={() => replaceInput.current?.click()} onFill={fillPage} />}
          {sel.kind === 'shape' && <>
            {(sel.shape === 'rect' || sel.shape === 'ellipse') && <Toggle label="Fill" checked={!!sel.fill} onChange={(v) => patch({ fill: v ? '#ffffff' : null })} />}
            {sel.fill && color('Fill color', sel.fill, (v) => patch({ fill: v }))}
            {color('Line color', sel.stroke, (v) => patch({ stroke: v }))}
            {range('Line width', sel.strokeW, 0, Math.max(20, Math.round(W / 40)), (v) => patch({ strokeW: v }))}
            {sel.shape === 'rect' && range('Corner radius', sel.radius, 0, 100, (v) => patch({ radius: v }), '%')}
          </>}
          {sel.kind === 'draw' && color('Color', sel.color, (v) => patch({ color: v }))}
          {range('Transparency', (1 - sel.opacity) * 100, 0, 95, (v) => patch({ opacity: 1 - v / 100 }), '%')}
          {range('Rotation', sel.rot, -180, 180, (v) => patch({ rot: v }), '°')}
          <b>Position</b>
          <div className="chip-grid">
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((a) => <button key={a} className="btn sm ghost" onClick={() => align(a)}>{a[0].toUpperCase() + a.slice(1)}</button>)}
          </div>
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => reorder('top')}>⤒ To front</button>
            <button className="btn sm ghost" onClick={() => reorder(1)}>⬆ Forward</button>
            <button className="btn sm ghost" onClick={() => reorder(-1)}>⬇ Back</button>
            <button className="btn sm ghost" onClick={() => reorder('bottom')}>⤓ To back</button>
          </div>
        </div>}
        <Status busy={busy} error={error} />
      </div>

      <div className="stage" ref={stage}>
        <div className="photo-topbar">
          <button className="btn sm ghost" disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">↶</button>
          <button className="btn sm ghost" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Y)">↷</button>
          <span className="muted">{W} × {H}px</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))} aria-label="Zoom out">−</button>
          <input type="range" min={20} max={400} value={Math.round(zoom * 100)} onChange={(e) => setZoom(+e.target.value / 100)} aria-label="Zoom" style={{ width: 110, height: 32 }} />
          <button className="btn sm ghost" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} aria-label="Zoom in">+</button>
          <button className="btn sm ghost" onClick={() => setZoom(1)} title="Fit to screen">{Math.round(zoom * 100)}%</button>
          <select value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="File type" style={{ height: 32 }}>
            <option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WEBP</option>
          </select>
          <button className="btn sm" onClick={save}>⬇ Download</button>
          <button className="btn sm ghost" onClick={() => setBase(null)} title="Start over">New</button>
        </div>
        <div className="canvas-wrap" style={{ width: shown }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <canvas
            ref={canvas}
            className="photo-canvas"
            style={{ width: shown, cursor: drawing ? 'crosshair' : 'default' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onDoubleClick={() => sel?.kind === 'text' && textBox.current?.select()}
          />
          {sel && !drawing && (
            <div className="float-bar" style={{ left: (sel.x + sel.w / 2) * s, top: Math.max(0, sel.y * s - 46) }}>
              {iconBtn('Rotate 90°', '⟳', () => patch({ rot: ((sel.rot + 90 + 180) % 360) - 180 }))}
              {iconBtn('Flip horizontally', '⇋', () => patch({ flipX: !sel.flipX }), !!sel.flipX)}
              {iconBtn('Flip vertically', '⇵', () => patch({ flipY: !sel.flipY }), !!sel.flipY)}
              {iconBtn(sel.locked ? 'Unlock' : 'Lock', sel.locked ? '🔒' : '🔓', () => patch({ locked: !sel.locked }), !!sel.locked)}
              {iconBtn('Duplicate (Ctrl+D)', '⧉', duplicate)}
              {iconBtn('Delete (Del)', '🗑', remove)}
            </div>
          )}
        </div>
        <p className="muted" style={{ textAlign: 'center', margin: '10px 0 0' }}>
          Drop images or PDFs on the design. Click to select, drag to move, corner square resizes, arrows nudge. Ctrl+scroll zooms.
        </p>
        {error && <button className="btn sm ghost" onClick={() => setError('')}>Dismiss error</button>}
      </div>
    </div>
  );
}

function ImageControls({ sel, patch, range, color, tol, setTol, onReplace, onFill }: {
  sel: ImageL;
  patch: (p: Partial<Layer>) => void;
  range: (label: string, value: number, min: number, max: number, on: (v: number) => void, unit?: string) => ReactNode;
  color: (label: string, value: string, on: (v: string) => void) => ReactNode;
  tol: number; setTol: (n: number) => void;
  onReplace: () => void; onFill: () => void;
}) {
  const [open, setOpen] = useState<'crop' | 'fx' | 'border' | 'bg' | null>(null);
  const cropSide = (side: 'l' | 't' | 'r' | 'b', label: string) => range(label, sel.crop[side] * 100, 0, 45, (v) => {
    const crop = { ...sel.crop, [side]: v / 100 };
    patch({ crop, h: imageHeight({ img: sel.img, crop }, sel.w) });
  }, '%');
  const fx = (k: AdjKey) => range(ADJ[k].label, sel.fx[k] ?? ADJ[k].def, ADJ[k].min, ADJ[k].max, (v) => patch({ fx: { ...sel.fx, [k]: v } as Partial<Adj> }), ADJ[k].unit === 'deg' ? '°' : ADJ[k].unit);
  const section = (id: NonNullable<typeof open>, label: string) => (
    <button className={`btn sm ghost ${open === id ? 'on' : ''}`} onClick={() => setOpen(open === id ? null : id)}>{label}</button>
  );
  return <>
    <div className="chip-grid">
      <button className="btn sm ghost" onClick={onReplace}>⇄ Replace</button>
      <button className="btn sm ghost" onClick={onFill}>⛶ Fill page</button>
      {section('crop', '⌗ Crop')}
      {section('fx', '✦ Edit')}
      {section('border', '▢ Border')}
      {section('bg', '◌ BG remove')}
    </div>
    {open === 'crop' && <>{cropSide('l', 'Crop left')}{cropSide('r', 'Crop right')}{cropSide('t', 'Crop top')}{cropSide('b', 'Crop bottom')}</>}
    {open === 'fx' && <>{IMAGE_FX.map((k) => <div key={k}>{fx(k)}</div>)}<button className="btn sm ghost" onClick={() => patch({ fx: {} })}>Reset image edits</button></>}
    {open === 'border' && <>
      {range('Border width', sel.border, 0, Math.max(30, Math.round(sel.w / 10)), (v) => patch({ border: v }))}
      {color('Border color', sel.borderColor, (v) => patch({ borderColor: v }))}
      {range('Corner radius', sel.radius, 0, 100, (v) => patch({ radius: v }), '%')}
    </>}
    {open === 'bg' && <>
      <span className="muted">Removes a plain background (white paper, solid colour) around logos, seals and signatures.</span>
      {range('Tolerance', tol, 2, 60, setTol)}
      <button className="btn sm" onClick={() => patch({ img: removePlainBackground(sel.img, tol) })}>Remove background</button>
    </>}
  </>;
}
