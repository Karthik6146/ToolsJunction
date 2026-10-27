import { useEffect, useRef, useState } from 'react';
import { FileDrop, Field, Segmented, Status, Toggle, useRunner } from '../../components/ui';
import { baseName, download } from '../../lib/files';
import { EXT, canvasToBlob, loadImage } from '../../lib/image';
import { rotateFlip } from './ImageTools';

const ADJ = {
  brightness: { label: 'Brightness', min: 0, max: 200, def: 100, unit: '%' },
  contrast: { label: 'Contrast', min: 0, max: 200, def: 100, unit: '%' },
  saturate: { label: 'Saturation', min: 0, max: 300, def: 100, unit: '%' },
  'hue-rotate': { label: 'Hue', min: 0, max: 360, def: 0, unit: 'deg' },
  blur: { label: 'Blur', min: 0, max: 20, def: 0, unit: 'px' },
  grayscale: { label: 'Grayscale', min: 0, max: 100, def: 0, unit: '%' },
  sepia: { label: 'Sepia', min: 0, max: 100, def: 0, unit: '%' },
  invert: { label: 'Invert', min: 0, max: 100, def: 0, unit: '%' },
} as const;
type AdjKey = keyof typeof ADJ;
const defaults = () => Object.fromEntries(Object.entries(ADJ).map(([k, v]) => [k, v.def])) as Record<AdjKey, number>;
const PRESETS: Record<string, Partial<Record<AdjKey, number>>> = {
  Original: {}, Vivid: { saturate: 160, contrast: 115 }, Mono: { grayscale: 100, contrast: 120 },
  Vintage: { sepia: 60, contrast: 90, brightness: 105 }, Cool: { 'hue-rotate': 190, saturate: 120 },
  Fade: { contrast: 80, brightness: 115, saturate: 70 }, Drama: { contrast: 150, saturate: 80, brightness: 95 },
  Warm: { sepia: 25, saturate: 130, brightness: 105 },
};

type Common = { id: number; x: number; y: number; w: number; h: number; rot: number; opacity: number };
type TextL = Common & { kind: 'text'; text: string; font: string; size: number; color: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; stroke: string | null; shadow: boolean; bg: string | null };
type ImageL = Common & { kind: 'image'; img: HTMLImageElement; radius: number };
type ShapeL = Common & { kind: 'shape'; shape: 'rect' | 'ellipse' | 'line' | 'arrow'; fill: string | null; stroke: string; strokeW: number; radius: number };
type DrawL = Common & { kind: 'draw'; pts: [number, number][]; color: string; width: number; ow: number; oh: number };
type Layer = TextL | ImageL | ShapeL | DrawL;
type Look = { vignette: number; radius: number; border: number; borderColor: string };
const LOOK0: Look = { vignette: 0, radius: 0, border: 0, borderColor: '#ffffff' };

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Trebuchet MS', 'Verdana', 'Comic Sans MS', 'Segoe Script', 'Segoe UI'];
const STICKERS = ['⭐', '❤️', '🔥', '✅', '🎉', '😀', '👍', '📍', '💡', '⚡', '🌸', '🎁'];
let uid = 1;

const fontStr = (t: TextL) => `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size}px "${t.font}", sans-serif`;
const measureCtx = () => document.createElement('canvas').getContext('2d')!;
function fitText(t: TextL): TextL {
  const m = measureCtx();
  m.font = fontStr(t);
  const lines = t.text.split('\n');
  const pad = t.size * 0.2;
  return { ...t, w: Math.max(t.size, ...lines.map((l) => m.measureText(l).width)) + 2 * pad, h: lines.length * t.size * 1.25 + 2 * pad };
}

/** Draws a layer into its own box at 0,0..w,h (caller has translated/rotated). */
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
    ctx.beginPath(); ctx.roundRect(0, 0, l.w, l.h, (l.radius / 100) * Math.min(l.w, l.h) / 2); ctx.clip();
    ctx.drawImage(l.img, 0, 0, l.w, l.h);
  } else if (l.kind === 'shape') {
    const s = l.strokeW;
    ctx.lineWidth = s; ctx.strokeStyle = l.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (l.shape === 'rect') ctx.roundRect(s / 2, s / 2, l.w - s, l.h - s, (l.radius / 100) * Math.min(l.w, l.h) / 2);
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

const filterOf = (a: Record<AdjKey, number>) => (Object.keys(ADJ) as AdjKey[]).map((k) => `${k}(${a[k]}${ADJ[k].unit})`).join(' ');

function render(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, adj: Record<AdjKey, number>, layers: Layer[], look: Look, sel: Layer | null, scale: number) {
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
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2); ctx.rotate((l.rot * Math.PI) / 180); ctx.translate(-l.w / 2, -l.h / 2);
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
    ctx.setLineDash([6 / scale, 4 / scale]); ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = '#3b82f6';
    ctx.strokeRect(0, 0, sel.w, sel.h);
    const s = 14 / scale;
    ctx.setLineDash([]); ctx.fillStyle = '#ffffff'; ctx.fillRect(sel.w - s / 2, sel.h - s / 2, s, s); ctx.strokeRect(sel.w - s / 2, sel.h - s / 2, s, s);
    ctx.restore();
  }
}

/** Point in a layer's own (unrotated) box coordinates. */
function toLocal(l: Layer, px: number, py: number): [number, number] {
  const a = (-l.rot * Math.PI) / 180, dx = px - (l.x + l.w / 2), dy = py - (l.y + l.h / 2);
  return [dx * Math.cos(a) - dy * Math.sin(a) + l.w / 2, dx * Math.sin(a) + dy * Math.cos(a) + l.h / 2];
}

export function ImageEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [adj, setAdj] = useState(defaults);
  const [look, setLook] = useState<Look>(LOOK0);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [past, setPast] = useState<Layer[][]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [tab, setTab] = useState<'adjust' | 'text' | 'elements' | 'draw' | 'frame'>('adjust');
  const [drawing, setDrawing] = useState(false);
  const [ink, setInk] = useState('#ff3b30');
  const [inkW, setInkW] = useState(8);
  const [fmt, setFmt] = useState('image/png');
  const canvas = useRef<HTMLCanvasElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ kind: 'move' | 'resize' | 'draw'; start: Layer; px: number; py: number } | null>(null);
  const { busy, error, run } = useRunner();

  useEffect(() => {
    if (!file) return;
    run(async () => {
      const img = await loadImage(file);
      setBase(rotateFlip(img, 0, false, false));
      setAdj(defaults()); setLook(LOOK0); setLayers([]); setPast([]); setSelId(null);
    });
  }, [file, run]);

  const sel = layers.find((l) => l.id === selId) ?? null;
  const W = base?.width ?? 1, H = base?.height ?? 1;
  const scale = () => (canvas.current ? canvas.current.clientWidth / W : 1);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    render(c.getContext('2d')!, base, adj, layers, look, drawing ? null : sel, scale());
  });

  // history: snapshot before each change the user would want to undo
  const commit = (next: Layer[]) => { setPast((p) => [...p.slice(-49), layers]); setLayers(next); };
  const undo = () => { if (!past.length) return; setLayers(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const patch = (p: Partial<Layer>) => {
    if (!sel) return;
    const next = { ...sel, ...p } as Layer;
    commit(layers.map((l) => (l.id === sel.id ? (next.kind === 'text' ? fitText(next) : next) : l)));
  };
  const add = (l: Layer) => { commit([...layers, l]); setSelId(l.id); setDrawing(false); };
  const remove = () => { if (sel) { commit(layers.filter((l) => l.id !== sel.id)); setSelId(null); } };
  const duplicate = () => { if (sel) add({ ...sel, id: uid++, x: sel.x + W * 0.03, y: sel.y + W * 0.03 }); };
  const reorder = (dir: 1 | -1) => {
    if (!sel) return;
    const i = layers.indexOf(sel), j = Math.max(0, Math.min(layers.length - 1, i + dir));
    const next = [...layers]; next.splice(i, 1); next.splice(j, 0, sel); commit(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remove(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicate(); }
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addText = (kind: 'heading' | 'sub' | 'body') => {
    const size = Math.round(W * { heading: 0.08, sub: 0.05, body: 0.032 }[kind]);
    const t = fitText({ id: uid++, kind: 'text', x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1, text: { heading: 'Add a heading', sub: 'Add a subheading', body: 'Add a little bit of body text' }[kind], font: kind === 'heading' ? 'Impact' : 'Arial', size, color: '#ffffff', bold: kind !== 'heading', italic: false, align: 'center', stroke: kind === 'heading' ? '#000000' : null, shadow: true, bg: null });
    add({ ...t, x: (W - t.w) / 2, y: (H - t.h) / 2 });
    setTimeout(() => textBox.current?.select(), 0);
  };
  const addShape = (shape: ShapeL['shape']) => {
    const w = W * 0.3, h = shape === 'line' || shape === 'arrow' ? Math.max(20, W * 0.04) : W * 0.3;
    add({ id: uid++, kind: 'shape', shape, x: (W - w) / 2, y: (H - h) / 2, w, h, rot: 0, opacity: 1, fill: shape === 'rect' || shape === 'ellipse' ? '#ffffff' : null, stroke: '#e5322d', strokeW: Math.max(2, Math.round(W * 0.006)), radius: 0 });
  };
  const addSticker = (s: string) => {
    const t = fitText({ id: uid++, kind: 'text', x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1, text: s, font: 'Segoe UI Emoji', size: Math.round(W * 0.12), color: '#000000', bold: false, italic: false, align: 'center', stroke: null, shadow: false, bg: null });
    add({ ...t, x: (W - t.w) / 2, y: (H - t.h) / 2 });
  };
  const addImages = (files: FileList | null) => run(async () => {
    let next = layers, last = 0;
    for (const f of [...(files ?? [])]) {
      const img = await loadImage(f);
      const w = Math.min(W * 0.4, img.naturalWidth), h = (w * img.naturalHeight) / img.naturalWidth;
      last = uid++;
      next = [...next, { id: last, kind: 'image', img, x: (W - w) / 2, y: (H - h) / 2, w, h, rot: 0, opacity: 1, radius: 0 }];
    }
    if (last) { commit(next); setSelId(last); }
  });

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onDown = (e: React.PointerEvent) => {
    const [px, py] = pt(e);
    canvas.current!.setPointerCapture(e.pointerId);
    if (drawing) {
      const l: DrawL = { id: uid++, kind: 'draw', x: 0, y: 0, w: W, h: H, ow: W, oh: H, rot: 0, opacity: 1, pts: [[px, py]], color: ink, width: inkW };
      setPast((p) => [...p.slice(-49), layers]);
      setLayers([...layers, l]);
      drag.current = { kind: 'draw', start: l, px, py };
      return;
    }
    const tol = 8 / scale();
    if (sel) {
      const [lx, ly] = toLocal(sel, px, py);
      if (Math.abs(lx - sel.w) < 2 * tol && Math.abs(ly - sel.h) < 2 * tol) {
        setPast((p) => [...p.slice(-49), layers]);
        drag.current = { kind: 'resize', start: sel, px, py };
        return;
      }
    }
    const hit = [...layers].reverse().find((l) => { const [lx, ly] = toLocal(l, px, py); return lx > -tol && ly > -tol && lx < l.w + tol && ly < l.h + tol; });
    setSelId(hit?.id ?? null);
    if (hit) { setPast((p) => [...p.slice(-49), layers]); drag.current = { kind: 'move', start: hit, px, py }; }
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

  const exportCanvas = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    render(c.getContext('2d')!, base!, adj, layers, look, null, 1);
    if (fmt === 'image/png') return c;
    const out = document.createElement('canvas'); // JPG/WEBP have no transparency: white under rounded corners
    out.width = W; out.height = H;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(c, 0, 0);
    return out;
  };
  const save = () => run(async () => download(await canvasToBlob(exportCanvas(), fmt, 0.92), `${baseName(file!.name)}-edited.${EXT[fmt]}`));
  // rotating the photo bakes everything (layers, filters, frame) into the new base image
  const transform = (deg: number, h: boolean, v: boolean) => {
    const flat = exportCanvas();
    setBase(rotateFlip(Object.assign(flat, { naturalWidth: flat.width, naturalHeight: flat.height }), deg, h, v));
    setLayers([]); setPast([]); setSelId(null); setAdj(defaults()); setLook(LOOK0);
  };

  if (!base) return <><FileDrop accept="image/*" onFiles={(f) => setFile(f[0])} label="Select image" /><Status busy={busy} error={error} /></>;

  const color = (label: string, value: string, on: (v: string) => void) => <Field label={label}><input type="color" value={value} onChange={(e) => on(e.target.value)} /></Field>;
  const range = (label: string, value: number, min: number, max: number, on: (v: number) => void, unit = '') => (
    <Field label={label} value={`${Math.round(value)}${unit}`}><input type="range" min={min} max={max} value={value} onChange={(e) => on(+e.target.value)} /></Field>
  );

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <Segmented label="Tools" value={tab} onChange={(t) => { setTab(t); setDrawing(t === 'draw'); }}
          options={[['adjust', 'Adjust'], ['text', 'Text'], ['elements', 'Add'], ['draw', 'Draw'], ['frame', 'Frame']]} />

        {tab === 'adjust' && <>
          <b>Filters</b>
          <div className="chip-grid">{Object.entries(PRESETS).map(([n, p]) => <button key={n} className="btn sm ghost" onClick={() => setAdj({ ...defaults(), ...p })}>{n}</button>)}</div>
          {(Object.keys(ADJ) as AdjKey[]).map((k) => range(ADJ[k].label, adj[k], ADJ[k].min, ADJ[k].max, (v) => setAdj({ ...adj, [k]: v }), ADJ[k].unit === 'deg' ? '°' : ADJ[k].unit))}
          <b>Rotate & flip photo</b>
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => transform(270, false, false)}>⟲ 90°</button>
            <button className="btn sm ghost" onClick={() => transform(90, false, false)}>⟳ 90°</button>
            <button className="btn sm ghost" onClick={() => transform(0, true, false)}>⇋ Flip</button>
            <button className="btn sm ghost" onClick={() => transform(0, false, true)}>⇵ Flip</button>
          </div>
          <span className="muted">Rotating merges text and elements into the photo.</span>
        </>}

        {tab === 'text' && <>
          <button className="btn sm ghost" style={{ fontSize: 17, fontWeight: 800 }} onClick={() => addText('heading')}>Add a heading</button>
          <button className="btn sm ghost" style={{ fontWeight: 700 }} onClick={() => addText('sub')}>Add a subheading</button>
          <button className="btn sm ghost" onClick={() => addText('body')}>Add body text</button>
        </>}

        {tab === 'elements' && <>
          <input ref={imgInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
          <button className="btn sm" onClick={() => imgInput.current?.click()}>🖼 Add image(s)</button>
          <b>Shapes</b>
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => addShape('rect')}>▭ Box</button>
            <button className="btn sm ghost" onClick={() => addShape('ellipse')}>◯ Circle</button>
            <button className="btn sm ghost" onClick={() => addShape('line')}>— Line</button>
            <button className="btn sm ghost" onClick={() => addShape('arrow')}>→ Arrow</button>
          </div>
          <b>Stickers</b>
          <div className="sticker-grid">{STICKERS.map((s) => <button key={s} onClick={() => addSticker(s)} aria-label={`Add ${s}`}>{s}</button>)}</div>
        </>}

        {tab === 'draw' && <>
          <span className="muted">Draw on the photo. Each stroke becomes a layer you can move.</span>
          {color('Brush color', ink, setInk)}
          {range('Brush size', inkW, 1, Math.max(40, Math.round(W / 30)), setInkW)}
        </>}

        {tab === 'frame' && <>
          {range('Vignette', look.vignette, 0, 90, (v) => setLook({ ...look, vignette: v }), '%')}
          {range('Rounded corners', look.radius, 0, 100, (v) => setLook({ ...look, radius: v }), '%')}
          {range('Border', look.border, 0, 100, (v) => setLook({ ...look, border: v }), '%')}
          {look.border > 0 && color('Border color', look.borderColor, (v) => setLook({ ...look, borderColor: v }))}
        </>}

        {sel && <div className="layer-panel">
          <b>Selected {sel.kind === 'text' ? 'text' : sel.kind}</b>
          {sel.kind === 'text' && <>
            <textarea ref={textBox} style={{ minHeight: 70 }} value={sel.text} onChange={(e) => patch({ text: e.target.value })} />
            <Field label="Font"><select value={sel.font} onChange={(e) => patch({ font: e.target.value })}>{[...new Set([sel.font, ...FONTS])].map((f) => <option key={f} style={{ fontFamily: f }}>{f}</option>)}</select></Field>
            {range('Size', sel.size, 6, Math.round(W / 3), (v) => patch({ size: v }))}
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
          {sel.kind === 'shape' && <>
            {(sel.shape === 'rect' || sel.shape === 'ellipse') && <Toggle label="Fill" checked={!!sel.fill} onChange={(v) => patch({ fill: v ? '#ffffff' : null })} />}
            {sel.fill && color('Fill color', sel.fill, (v) => patch({ fill: v }))}
            {color('Line color', sel.stroke, (v) => patch({ stroke: v }))}
            {range('Line width', sel.strokeW, 0, Math.max(20, Math.round(W / 40)), (v) => patch({ strokeW: v }))}
            {sel.shape === 'rect' && range('Corner radius', sel.radius, 0, 100, (v) => patch({ radius: v }), '%')}
          </>}
          {sel.kind === 'image' && range('Corner radius', sel.radius, 0, 100, (v) => patch({ radius: v }), '%')}
          {sel.kind === 'draw' && color('Color', sel.color, (v) => patch({ color: v }))}
          {range('Opacity', sel.opacity * 100, 5, 100, (v) => patch({ opacity: v / 100 }), '%')}
          {range('Rotation', sel.rot, -180, 180, (v) => patch({ rot: v }), '°')}
          <div className="chip-grid">
            <button className="btn sm ghost" onClick={() => reorder(1)} title="Bring forward">⬆ Forward</button>
            <button className="btn sm ghost" onClick={() => reorder(-1)} title="Send backward">⬇ Back</button>
            <button className="btn sm ghost" onClick={duplicate} title="Ctrl+D">⧉ Copy</button>
            <button className="btn sm ghost" onClick={remove} title="Delete">🗑 Delete</button>
          </div>
        </div>}

        <div className="chip-grid">
          <button className="btn sm ghost" disabled={!past.length} onClick={undo} title="Ctrl+Z">↶ Undo</button>
          <button className="btn sm ghost" onClick={() => { commit([]); setSelId(null); setAdj(defaults()); setLook(LOOK0); }}>Reset all</button>
        </div>
        <Segmented label="Save as" value={fmt} onChange={setFmt} options={[['image/png', 'PNG'], ['image/jpeg', 'JPG'], ['image/webp', 'WEBP']]} />
        <button className="btn" onClick={save}>Download</button>
        <button className="btn sm ghost" onClick={() => { setBase(null); setFile(null); }}>Open another image</button>
        <Status busy={busy} error={error} />
      </div>
      <div className="stage">
        <canvas
          ref={canvas}
          className="photo-canvas"
          style={{ cursor: drawing ? 'crosshair' : 'default' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => sel?.kind === 'text' && textBox.current?.select()}
        />
        <p className="muted" style={{ textAlign: 'center', margin: '10px 0 0' }}>Click a layer to select it, drag to move, drag the corner square to resize. Del deletes, Ctrl+Z undoes, Ctrl+D duplicates.</p>
      </div>
    </div>
  );
}
