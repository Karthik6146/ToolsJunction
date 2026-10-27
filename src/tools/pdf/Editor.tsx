import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Field, Status, useRunner } from '../../components/ui';
import { dscBridge, listSigFields, signPdf, type DscCert, type SigField } from '../../lib/dsc';
import { PDF_TYPE, download, type Bytes } from '../../lib/files';
import { applyObjects, type FontName, type Obj } from '../../lib/annotate';
import { replaceWithRaster } from '../../lib/pdf';
import { canvasToBytes, openPdfjs, renderPage, type PDFDocumentProxy } from '../../lib/pdfjs';
import { PdfPicker, outName, usePdf } from './common';

type Mode = 'select' | 'text' | 'rect' | 'whiteout' | 'highlight' | 'draw' | 'note' | 'redact';
type Pending = { src: string; w: number; h: number } | null;
type PageInfo = { w: number; h: number; img: string };

const MODE_LABEL: Record<Mode, string> = {
  select: '↖ Select / move', text: 'T Add text', rect: '▭ Rectangle', whiteout: '◻ Whiteout', highlight: '▬ Highlight',
  draw: '✎ Freehand', note: '💬 Sticky note', redact: '█ Redact area',
};
const CSS_FONT: Record<FontName, string> = {
  Helvetica: 'Helvetica, Arial, sans-serif', 'Helvetica-Bold': 'Helvetica, Arial, sans-serif',
  'Times-Roman': '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace',
};
let nextId = 1;

function usePages(bytes: Bytes | null) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => {
    setPages([]);
    setDoc(null);
    if (!bytes) return;
    let dead = false;
    (async () => {
      const d = await openPdfjs(bytes);
      if (dead) return;
      setDoc(d);
      for (let i = 0; i < d.numPages && !dead; i++) {
        const vp = (await d.getPage(i + 1)).getViewport({ scale: 1 });
        // 2x keeps small form text readable when zoomed to page width
        const c = await renderPage(d, i, 2);
        const info = { w: vp.width, h: vp.height, img: c.toDataURL('image/jpeg', 0.85) };
        if (!dead) setPages((p) => [...p, info]);
      }
    })().catch(console.error);
    return () => { dead = true; };
  }, [bytes]);
  return { pages, doc };
}

function textSize(text: string, size: number) {
  const lines = text.split('\n');
  return { w: Math.max(20, Math.max(...lines.map((l) => l.length)) * size * 0.56 + 6), h: lines.length * size * 1.2 + 4 };
}

type EditorHandle = { bytes: Bytes | null; doc: PDFDocumentProxy | null; file: File | null; setFile: (f: File) => void };

function PdfCanvasEditor({ modes, sidebar, saveLabel, onSave, pending, setPending, objs, setObjs, bytesRef, overlay }: {
  modes: Mode[];
  sidebar?: (ctx: { page: number; addObj: (o: Obj) => void; bytes: Bytes | null }) => ReactNode;
  saveLabel: string;
  onSave: (bytes: Bytes, objs: Obj[], file: File | null, setProgress: (s: string) => void) => Promise<void>;
  pending: Pending;
  setPending: (p: Pending) => void;
  objs: Obj[];
  setObjs: React.Dispatch<React.SetStateAction<Obj[]>>;
  bytesRef?: React.MutableRefObject<EditorHandle>;
  /** extra clickable items drawn over a page, e.g. signature fields */
  overlay?: (page: number, zoom: number) => ReactNode;
}) {
  const pdf = usePdf();
  const { pages, doc } = usePages(pdf.bytes);
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const userZoomed = useRef(false);
  const widest = pages.length ? Math.max(...pages.map((p) => p.w)) : 0;
  const fitWidth = () => {
    const w = stage.current?.clientWidth;
    if (w && widest) setZoom(Math.min(2, Math.max(0.4, (w - 34) / widest)));
  };
  // fit pages to the stage until the user picks a zoom themselves
  useEffect(() => {
    if (!userZoomed.current) fitWidth();
    const onResize = () => !userZoomed.current && fitWidth();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [widest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [color, setColor] = useState(modes.includes('redact') ? '#000000' : '#e5322d');
  const [size, setSize] = useState(16);
  const [font, setFont] = useState<FontName>('Helvetica');
  const [curPage, setCurPage] = useState(0);
  const drag = useRef<{ id: number; kind: 'move' | 'resize' | 'create' | 'draw'; sx: number; sy: number; o: Obj } | null>(null);

  useEffect(() => { setObjs([]); setSel(null); }, [pdf.bytes, setObjs]);
  if (bytesRef) bytesRef.current = { bytes: pdf.bytes, doc, file: pdf.file, setFile: pdf.setFile };

  const selected = objs.find((o) => o.id === sel);
  const update = (id: number, patch: Partial<Obj>) => setObjs((os) => os.map((o) => (o.id === id ? ({ ...o, ...patch } as Obj) : o)));
  const remove = (id: number) => { setObjs((os) => os.filter((o) => o.id !== id)); setSel(null); };
  const addObj = (o: Obj) => { setObjs((os) => [...os, o]); setSel(o.id); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (sel !== null && (e.key === 'Delete' || e.key === 'Backspace') && !['TEXTAREA', 'INPUT'].includes(t.tagName)) remove(sel);
      if (e.key === 'Escape') { setSel(null); setPending(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pt = (e: React.PointerEvent, el: HTMLElement): [number, number] => {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  const onPageDown = (e: React.PointerEvent<HTMLDivElement>, page: number) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('ov-svg')) return;
    setCurPage(page);
    const [x, y] = pt(e, e.currentTarget);
    if (pending) {
      const w = Math.min(180, pages[page].w * 0.4), h = (w * pending.h) / pending.w;
      addObj({ id: nextId++, page, kind: 'image', x: x - w / 2, y: y - h / 2, w, h, src: pending.src });
      setPending(null);
      setMode('select');
      return;
    }
    if (mode === 'select') { setSel(null); return; }
    if (mode === 'text') {
      const text = 'Type here';
      addObj({ id: nextId++, page, kind: 'text', x, y, ...textSize(text, size), text, size, color, font });
      setMode('select');
      return;
    }
    if (mode === 'note') {
      addObj({ id: nextId++, page, kind: 'note', x, y, w: 22, h: 22, text: '', color: '#ffd400' });
      setMode('select');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = nextId++;
    const o: Obj = mode === 'draw'
      ? { id, page, kind: 'draw', x: 0, y: 0, w: pages[page].w, h: pages[page].h, color, width: Math.max(1, size / 8), pts: [[x, y]] }
      : { id, page, kind: mode, x, y, w: 0, h: 0, color: mode === 'highlight' && color === '#e5322d' ? '#ffeb3b' : color };
    setObjs((os) => [...os, o]);
    drag.current = { id, kind: mode === 'draw' ? 'draw' : 'create', sx: x, sy: y, o };
  };

  const onPageMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = pt(e, e.currentTarget);
    if (d.kind === 'draw') {
      setObjs((os) => os.map((o) => (o.id === d.id && o.kind === 'draw' ? { ...o, pts: [...o.pts, [x, y]] } : o)));
    } else if (d.kind === 'create') {
      update(d.id, { x: Math.min(x, d.sx), y: Math.min(y, d.sy), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) });
    } else if (d.kind === 'move') {
      update(d.id, { x: d.o.x + x - d.sx, y: d.o.y + y - d.sy });
    } else {
      const w = Math.max(8, d.o.w + x - d.sx);
      const h = d.o.kind === 'image' ? (w * d.o.h) / d.o.w : Math.max(8, d.o.h + y - d.sy);
      update(d.id, { w, h });
    }
  };

  const onPageUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'create') setObjs((os) => os.filter((o) => o.id !== d.id || (o.w > 3 && o.h > 3)));
  };

  const startObj = (e: React.PointerEvent, o: Obj, kind: 'move' | 'resize') => {
    if (mode !== 'select' && kind === 'move') return;
    e.stopPropagation();
    setSel(o.id);
    setCurPage(o.page);
    const pageEl = (e.currentTarget as HTMLElement).closest('.ov') as HTMLElement;
    pageEl.setPointerCapture(e.pointerId);
    const [sx, sy] = pt(e, pageEl);
    drag.current = { id: o.id, kind, sx, sy, o };
  };

  const renderObj = (o: Obj) => {
    const z = zoom;
    const isSel = o.id === sel;
    const style: React.CSSProperties = { left: o.x * z, top: o.y * z, width: o.w * z, height: o.h * z, cursor: mode === 'select' ? 'move' : undefined };
    const chrome = isSel && <>
      <button className="del" aria-label="Delete" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(o.id)}>✕</button>
      {o.kind !== 'note' && o.kind !== 'draw' && <span className="handle" onPointerDown={(e) => startObj(e, o, 'resize')} />}
    </>;
    if (o.kind === 'draw') {
      return (
        <svg key={o.id} className="ov-svg" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={o.w * z} height={o.h * z}>
          <polyline
            points={o.pts.map(([x, y]) => `${(o.x + x) * z},${(o.y + y) * z}`).join(' ')}
            fill="none" stroke={isSel ? '#3b82f6' : o.color} strokeWidth={o.width * z} strokeLinecap="round" strokeLinejoin="round"
            style={{ pointerEvents: 'stroke', cursor: mode === 'select' ? 'move' : undefined }}
            onPointerDown={(e) => startObj(e, o, 'move')}
          />
          {isSel && <foreignObject x={(o.x + o.pts[0][0]) * z} y={(o.y + o.pts[0][1]) * z - 30} width={30} height={30} style={{ pointerEvents: 'auto' }}>
            <button className="del" style={{ position: 'static' }} onClick={() => remove(o.id)}>✕</button>
          </foreignObject>}
        </svg>
      );
    }
    let body: ReactNode = null;
    if (o.kind === 'text') {
      body = (
        <textarea
          value={o.text}
          wrap="off"
          spellCheck={false}
          onFocus={() => setSel(o.id)}
          onPointerDown={(e) => { if (isSel) e.stopPropagation(); else startObj(e, o, 'move'); }}
          onChange={(e) => update(o.id, { text: e.target.value, ...textSize(e.target.value, o.size) })}
          style={{ fontSize: o.size * z, color: o.color, fontFamily: CSS_FONT[o.font], fontWeight: o.font === 'Helvetica-Bold' ? 700 : 400 }}
        />
      );
    }
    if (o.kind === 'image') body = <img src={o.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />;
    if (o.kind === 'note') body = <span style={{ fontSize: 18 * z, lineHeight: 1 }} title={o.text}>💬</span>;
    const bg: Record<string, React.CSSProperties> = {
      rect: { border: `2px solid ${'color' in o ? o.color : ''}` },
      whiteout: { background: '#fff', outline: '1px dashed #bbb' },
      highlight: { background: 'color' in o ? o.color : '', opacity: 0.35 },
      redact: { background: '#000' },
    };
    return (
      <div key={o.id} className={`obj ${isSel ? 'sel' : ''}`} style={{ ...style, ...bg[o.kind] }} onPointerDown={(e) => startObj(e, o, 'move')}>
        {body}{chrome}
      </div>
    );
  };

  const save = () => pdf.run(async () => {
    if (!objs.length) throw new Error('Nothing to save yet: add something to the page first.');
    await onSave(pdf.bytes!, objs, pdf.file, pdf.setProgress);
  });

  if (!pdf.bytes) return <PdfPicker pdf={pdf} />;
  return (
    <>
      <PdfPicker pdf={pdf} />
      <div className="editor-wrap">
        <div className="toolbar">
          {modes.length > 1 && modes.map((m) => (
            <button key={m} className={`btn sm ghost ${mode === m && !pending ? 'on' : ''}`} onClick={() => { setMode(m); setPending(null); }}>{MODE_LABEL[m]}</button>
          ))}
          {sidebar?.({ page: curPage, addObj, bytes: pdf.bytes })}
          {pending && <div className="status busy">Click on a page to place it. <button className="btn sm ghost" onClick={() => setPending(null)}>Cancel</button></div>}
          {!modes.includes('redact') && <Field label="Color"><input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (selected && 'color' in selected) update(selected.id, { color: e.target.value }); }} /></Field>}
          {(modes.includes('text') || modes.includes('draw')) && <Field label="Size" value={`${size}`}>
            <input type="range" min={6} max={72} value={size} onChange={(e) => { setSize(+e.target.value); if (selected?.kind === 'text') update(selected.id, { size: +e.target.value, ...textSize(selected.text, +e.target.value) }); }} />
          </Field>}
          {modes.includes('text') && <Field label="Font">
            <select value={font} onChange={(e) => { setFont(e.target.value as FontName); if (selected?.kind === 'text') update(selected.id, { font: e.target.value as FontName }); }}>
              <option value="Helvetica">Sans</option><option value="Helvetica-Bold">Sans bold</option><option value="Times-Roman">Serif</option><option value="Courier">Mono</option>
            </select>
          </Field>}
          {selected?.kind === 'note' && <Field label="Note text"><textarea style={{ minHeight: 80 }} value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} autoFocus /></Field>}
          <Field label="Zoom" value={`${Math.round(zoom * 100)}%`}>
            <input type="range" min={40} max={250} step={10} value={Math.round(zoom * 100)} onChange={(e) => { userZoomed.current = true; setZoom(+e.target.value / 100); }} />
          </Field>
          <button className="btn sm ghost" onClick={() => { userZoomed.current = false; fitWidth(); }}>↔ Fit to width</button>
          <button className="btn" disabled={pdf.busy} onClick={save}>{saveLabel}</button>
          <span className="muted">{objs.length} item(s) · Del removes selected</span>
          <Status busy={pdf.busy} error={pdf.error} progress={pdf.progress} />
        </div>
        <div className="stage" ref={stage}>
          {!pages.length && <div className="status busy"><span className="spin" /> Rendering pages…</div>}
          {pages.map((p, i) => (
            <div key={i} className="page-holder" style={{ width: p.w * zoom, height: p.h * zoom }}>
              <img src={p.img} alt={`Page ${i + 1}`} style={{ width: '100%', height: '100%', display: 'block' }} draggable={false} />
              <div
                className="ov"
                style={{ cursor: pending || mode !== 'select' ? 'crosshair' : 'default' }}
                onPointerDown={(e) => onPageDown(e, i)}
                onPointerMove={onPageMove}
                onPointerUp={onPageUp}
              >
                {overlay?.(i, zoom)}
                {objs.filter((o) => o.page === i).map(renderObj)}
              </div>
              <span className="muted" style={{ position: 'absolute', bottom: -20, right: 0 }}>{i + 1} / {pages.length}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function imageFileToPending(f: File): Promise<Pending> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        // re-encode to PNG so any browser-readable format can be embedded
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        res({ src: c.toDataURL('image/png'), w: c.width, h: c.height });
      };
      img.onerror = () => rej(new Error('Unsupported image'));
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  });
}

function ImagePickButton({ onPick, label }: { onPick: (p: Pending) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(await imageFileToPending(f)); }} />
    <button className="btn sm ghost" onClick={() => ref.current?.click()}>{label}</button>
  </>;
}

const saveApplied = async (bytes: Bytes, objs: Obj[], file: File | null, suffix: string) =>
  download(await applyObjects(bytes, objs), outName(file, suffix), PDF_TYPE);

export function EditPdf() {
  const [pending, setPending] = useState<Pending>(null);
  const [objs, setObjs] = useState<Obj[]>([]);
  return (
    <PdfCanvasEditor
      modes={['select', 'text', 'rect', 'whiteout', 'highlight', 'draw', 'note']}
      saveLabel="Save PDF"
      pending={pending} setPending={setPending} objs={objs} setObjs={setObjs}
      sidebar={() => <ImagePickButton label="🖼 Add image" onPick={setPending} />}
      onSave={(b, o, f) => saveApplied(b, o, f, 'edited')}
    />
  );
}

function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error('Signature is empty');
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 9;
  out.height = y1 - y0 + 9;
  out.getContext('2d')!.drawImage(c, x0 - 4, y0 - 4, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const SIG_FONTS = ['"Segoe Script", cursive', '"Brush Script MT", cursive', '"Lucida Handwriting", cursive', '"Comic Sans MS", cursive'];

function SignaturePad({ onUse }: { onUse: (p: Pending) => void }) {
  const [tab, setTab] = useState<'draw' | 'type'>('draw');
  const [ink, setInk] = useState('#1d3fbb');
  const [name, setName] = useState('');
  const [sigFont, setSigFont] = useState(SIG_FONTS[0]);
  const [err, setErr] = useState('');
  const pad = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * pad.current!.width, ((e.clientY - r.top) / r.height) * pad.current!.height];
  };
  const use = () => {
    setErr('');
    try {
      let c: HTMLCanvasElement;
      if (tab === 'draw') c = trimCanvas(pad.current!);
      else {
        if (!name.trim()) throw new Error('Type your name first');
        c = document.createElement('canvas');
        c.width = 900; c.height = 220;
        const ctx = c.getContext('2d')!;
        ctx.font = `96px ${sigFont}`;
        ctx.fillStyle = ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 20, 110);
        c = trimCanvas(c);
      }
      onUse({ src: c.toDataURL('image/png'), w: c.width, h: c.height });
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <b>Drawn / typed signature</b>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className={`btn sm ghost ${tab === 'draw' ? 'on' : ''}`} onClick={() => setTab('draw')}>Draw</button>
        <button className={`btn sm ghost ${tab === 'type' ? 'on' : ''}`} onClick={() => setTab('type')}>Type</button>
        <ImagePickButton label="Upload" onPick={onUse} />
      </div>
      {tab === 'draw' ? (
        <canvas
          ref={pad} width={600} height={220}
          style={{ width: '100%', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={(e) => {
            down.current = true;
            pad.current!.setPointerCapture(e.pointerId);
            const ctx = pad.current!.getContext('2d')!;
            const [x, y] = pos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!down.current) return;
            const ctx = pad.current!.getContext('2d')!;
            ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = ctx.lineJoin = 'round';
            const [x, y] = pos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
          }}
          onPointerUp={() => (down.current = false)}
        />
      ) : <>
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }} />
        <select value={sigFont} onChange={(e) => setSigFont(e.target.value)}>{SIG_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f.split(',')[0].replace(/"/g, '')}</option>)}</select>
        {name && <div style={{ fontFamily: sigFont, fontSize: 32, color: ink, background: '#fff', borderRadius: 8, padding: '4px 8px' }}>{name}</div>}
      </>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} aria-label="Ink color" />
        {tab === 'draw' && <button className="btn sm ghost" onClick={() => pad.current!.getContext('2d')!.clearRect(0, 0, 600, 220)}>Clear</button>}
        <button className="btn sm" onClick={use}>Place</button>
      </div>
      {err && <div className="status error">{err}</div>}
    </div>
  );
}

const RELEASES = 'https://github.com/Karthik6146/ToolsJunction/releases/latest';

function DscPanel({ bytes, editor, objs, fields, setFields, target, setTarget }: {
  bytes: Bytes | null;
  editor: React.MutableRefObject<EditorHandle>;
  objs: Obj[];
  fields: SigField[];
  setFields: (f: SigField[]) => void;
  target: string;
  setTarget: (n: string) => void;
}) {
  const bridge = dscBridge();
  const [certs, setCerts] = useState<DscCert[] | null>(null);
  const [thumb, setThumb] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, progress, setProgress, run } = useRunner();

  useEffect(() => {
    setFields([]);
    setTarget('');
    if (!bytes) return;
    listSigFields(bytes).then((f) => {
      setFields(f);
      setTarget(f.find((x) => !x.signed)?.name ?? '');
    }).catch(() => {});
  }, [bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = fields.filter((f) => !f.signed);
  const unique = [...new Set(empty.map((f) => f.name))];

  if (!bridge) {
    return <>
      <b>Digital signature (DSC)</b>
      <p className="muted" style={{ margin: 0 }}>
        Signing with a DSC USB token needs the <a href={RELEASES} target="_blank" rel="noreferrer">ToolsJunction Windows app</a>.
        {fields.length > 0 && ` This PDF has ${empty.length} empty signature field(s).`}
      </p>
    </>;
  }

  const loadCerts = () => run(async () => {
    const list = await bridge.list();
    if (!list.length) throw new Error('No certificate found. Plug in your DSC token and make sure its driver is installed.');
    setCerts(list);
    setThumb(list[0].thumbprint);
  });

  const sign = () => run(async () => {
    const ed = editor.current;
    const cert = certs!.find((c) => c.thumbprint === thumb)!;
    let input = bytes!;
    if (objs.length) {
      // drawn items rewrite the file, which would invalidate signatures already in it
      if (fields.some((f) => f.signed)) throw new Error('This PDF already has a signature. Remove drawn items, or save them before anyone signs.');
      input = await applyObjects(input, objs);
    }
    setProgress('Enter your DSC PIN in the token window…');
    const out = await signPdf(input, { fieldName: target || undefined, signer: cert.name, reason: reason || undefined }, (d) => bridge.sign(thumb, d));
    const name = outName(ed.file, 'signed');
    download(out, name, PDF_TYPE);
    // continue from the signed file so a second partner signs on top of the first
    ed.setFile(new File([out as BlobPart], name, { type: PDF_TYPE }));
  });

  return <>
    <b>Digital signature (DSC)</b>
    {!certs ? (
      <button className="btn sm" disabled={busy} onClick={loadCerts}>🔑 Use my DSC token</button>
    ) : <>
      <Field label="Certificate">
        <select value={thumb} onChange={(e) => setThumb(e.target.value)}>
          {certs.map((c) => <option key={c.thumbprint} value={c.thumbprint}>{c.name} · {c.issuer} · exp {c.expires}</option>)}
        </select>
      </Field>
      <Field label="Sign in">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {unique.map((n) => <option key={n} value={n}>Field: {n}</option>)}
          <option value="">New invisible signature</option>
        </select>
      </Field>
      <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved" /></Field>
      <button className="btn sm" disabled={busy || !thumb} onClick={sign}>✍ Sign with DSC</button>
    </>}
    {fields.length > 0 && <span className="muted">{empty.length} of {fields.length} signature field(s) empty · click a blue box to choose it</span>}
    <Status busy={busy} error={error} progress={progress} />
  </>;
}

export function SignPdf() {
  const [pending, setPending] = useState<Pending>(null);
  const [objs, setObjs] = useState<Obj[]>([]);
  const [fields, setFields] = useState<SigField[]>([]);
  const [target, setTarget] = useState('');
  const editor = useRef<EditorHandle>({ bytes: null, doc: null, file: null, setFile: () => {} });
  return (
    <PdfCanvasEditor
      modes={['select', 'text']}
      saveLabel="Save signed PDF"
      pending={pending} setPending={setPending} objs={objs} setObjs={setObjs} bytesRef={editor}
      overlay={(page, z) => fields.filter((f) => f.page === page).map((f, i) => (
        <button
          key={`${f.name}-${i}`}
          className={`sigbox ${f.signed ? 'signed' : ''} ${target === f.name ? 'on' : ''}`}
          style={{ left: f.x * z, top: f.y * z, width: f.w * z, height: f.h * z }}
          disabled={f.signed}
          title={f.signed ? `${f.name}: signed` : `Signature field ${f.name}`}
          onClick={() => setTarget(f.name)}
        >{f.signed ? '✓ Signed' : 'Sign here'}</button>
      ))}
      sidebar={({ page, addObj, bytes }) => <>
        <DscPanel bytes={bytes} editor={editor} objs={objs} fields={fields} setFields={setFields} target={target} setTarget={setTarget} />
        <SignaturePad onUse={setPending} />
        <button className="btn sm ghost" onClick={() => {
          const text = new Date().toLocaleDateString();
          addObj({ id: nextId++, page, kind: 'text', x: 40, y: 40, ...textSize(text, 12), text, size: 12, color: '#000000', font: 'Helvetica' });
        }}>📅 Add date (page {page + 1})</button>
      </>}
      onSave={(b, o, f) => saveApplied(b, o, f, 'signed')}
    />
  );
}

/** Boxes (display coords at scale 1) around every occurrence of `term` on a page. */
async function findText(doc: PDFDocumentProxy, index: number, term: string) {
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const needle = term.toLowerCase();
  for (const it of tc.items) {
    if (!('str' in it) || !it.str) continue;
    const hay = it.str.toLowerCase();
    const tx = pdfjs.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]);
    const width = it.width * vp.scale;
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
      boxes.push({ x: tx[4] + (width * at) / hay.length - 1, y: tx[5] - fh, w: (width * needle.length) / hay.length + 2, h: fh * 1.25 });
    }
  }
  return boxes;
}

export function RedactPdf() {
  const [objs, setObjs] = useState<Obj[]>([]);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState('');
  const ref = useRef<EditorHandle>({ bytes: null, doc: null, file: null, setFile: () => {} });
  const search = async () => {
    const doc = ref.current.doc;
    if (!doc || !term.trim()) return;
    const add: Obj[] = [];
    for (let i = 0; i < doc.numPages; i++)
      for (const b of await findText(doc, i, term.trim())) add.push({ id: nextId++, page: i, kind: 'redact', color: '#000000', ...b });
    setObjs((o) => [...o, ...add]);
    setFound(`${add.length} match(es) marked`);
  };
  return (
    <>
      <p className="muted">Drag boxes over anything sensitive, or search for text. Redacted pages are flattened to images so the hidden content is truly removed.</p>
      <PdfCanvasEditor
        modes={['redact', 'select']}
        saveLabel="Apply redactions & save"
        pending={null} setPending={() => {}} objs={objs} setObjs={setObjs} bytesRef={ref}
        sidebar={() => <>
          <Field label="Find & redact text"><input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="e.g. name, phone number" /></Field>
          <button className="btn sm ghost" onClick={search}>Mark all matches</button>
          {found && <span className="muted">{found}</span>}
        </>}
        onSave={async (bytes, os, file, progress) => {
          const marked = await applyObjects(bytes, os);
          const doc = await openPdfjs(marked);
          const scale = 2;
          const raster = new Map<number, Bytes>();
          const redactedPages = [...new Set(os.filter((o) => o.kind === 'redact').map((o) => o.page))];
          for (const [n, i] of redactedPages.entries()) {
            progress(`Flattening page ${n + 1} of ${redactedPages.length}…`);
            raster.set(i, await canvasToBytes(await renderPage(doc, i, scale), 'image/jpeg', 0.9));
          }
          download(await replaceWithRaster(marked, raster, scale), outName(file, 'redacted'), PDF_TYPE);
        }}
      />
    </>
  );
}
