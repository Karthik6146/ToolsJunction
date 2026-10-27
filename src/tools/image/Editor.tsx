import { useEffect, useRef, useState } from 'react';
import { FileDrop, Field, Status, useRunner } from '../../components/ui';
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
  opacity: { label: 'Opacity', min: 0, max: 100, def: 100, unit: '%' },
} as const;
type AdjKey = keyof typeof ADJ;
const defaults = () => Object.fromEntries(Object.entries(ADJ).map(([k, v]) => [k, v.def])) as Record<AdjKey, number>;

const PRESETS: Record<string, Partial<Record<AdjKey, number>>> = {
  Original: {},
  Vivid: { saturate: 160, contrast: 115 },
  Mono: { grayscale: 100, contrast: 120 },
  Vintage: { sepia: 60, contrast: 90, brightness: 105 },
  Cool: { 'hue-rotate': 190, saturate: 120 },
  Fade: { contrast: 80, brightness: 115, saturate: 70 },
};

type Layer =
  | { kind: 'stroke'; color: string; width: number; pts: [number, number][] }
  | { kind: 'text'; color: string; size: number; text: string; x: number; y: number; bold: boolean };

export function ImageEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [adj, setAdj] = useState(defaults);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [mode, setMode] = useState<'none' | 'draw' | 'text'>('none');
  const [color, setColor] = useState('#ff3b30');
  const [size, setSize] = useState(48);
  const [text, setText] = useState('Your text');
  const [bold, setBold] = useState(true);
  const [fmt, setFmt] = useState('image/png');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const { busy, error, run } = useRunner();

  useEffect(() => {
    if (!file) return;
    run(async () => {
      const img = await loadImage(file);
      setBase(rotateFlip(img, 0, false, false));
      setAdj(defaults());
      setLayers([]);
    });
  }, [file, run]);

  const filter = () => (Object.keys(ADJ) as AdjKey[]).map((k) => `${k}(${adj[k]}${ADJ[k].unit})`).join(' ');

  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.filter = filter();
    ctx.drawImage(base, 0, 0);
    ctx.filter = 'none';
    for (const l of layers) {
      if (l.kind === 'stroke') {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      } else {
        ctx.fillStyle = l.color;
        ctx.font = `${l.bold ? 'bold ' : ''}${l.size}px system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        l.text.split('\n').forEach((line, i) => ctx.fillText(line, l.x, l.y + i * l.size * 1.2));
      }
    }
  });

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * base!.width, ((e.clientY - r.top) / r.height) * base!.height];
  };
  const lineWidth = () => Math.max(2, (size / 8) * (base!.width / 1000) * 4);

  const onDown = (e: React.PointerEvent) => {
    if (mode === 'text' && text.trim()) setLayers((l) => [...l, { kind: 'text', color, size, text, x: pt(e)[0], y: pt(e)[1], bold }]);
    if (mode === 'draw') {
      drawing.current = true;
      canvas.current!.setPointerCapture(e.pointerId);
      setLayers((l) => [...l, { kind: 'stroke', color, width: lineWidth(), pts: [pt(e)] }]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pt(e);
    setLayers((l) => {
      const last = l[l.length - 1];
      return last?.kind === 'stroke' ? [...l.slice(0, -1), { ...last, pts: [...last.pts, p] }] : l;
    });
  };

  // rotate/flip bakes current pixels (adjustments + layers stay live)
  const transform = (deg: number, h: boolean, v: boolean) => {
    if (!base) return;
    const tmp = Object.assign(base, { naturalWidth: base.width, naturalHeight: base.height });
    setBase(rotateFlip(tmp, deg, h, v));
    setLayers([]);
  };

  const save = () => run(async () => {
    const blob = await canvasToBlob(canvas.current!, fmt, 0.92);
    download(blob, `${baseName(file!.name)}-edited.${EXT[fmt]}`);
  });

  if (!base) return <><FileDrop accept="image/*" onFiles={(f) => setFile(f[0])} label="Select image" /><Status busy={busy} error={error} /></>;

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <b>Presets</b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.entries(PRESETS).map(([n, p]) => <button key={n} className="btn sm ghost" onClick={() => setAdj({ ...defaults(), ...p })}>{n}</button>)}
        </div>
        <b>Adjust</b>
        {(Object.keys(ADJ) as AdjKey[]).map((k) => (
          <Field key={k} label={`${ADJ[k].label}: ${adj[k]}${ADJ[k].unit === 'deg' ? '°' : ADJ[k].unit}`}>
            <input type="range" min={ADJ[k].min} max={ADJ[k].max} value={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: +e.target.value })} />
          </Field>
        ))}
        <b>Transform</b>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={() => transform(270, false, false)}>⟲ 90°</button>
          <button className="btn sm ghost" onClick={() => transform(90, false, false)}>⟳ 90°</button>
          <button className="btn sm ghost" onClick={() => transform(0, true, false)}>⇋ Flip</button>
          <button className="btn sm ghost" onClick={() => transform(0, false, true)}>⇵ Flip</button>
        </div>
        <b>Draw & text</b>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn sm ghost ${mode === 'draw' ? 'on' : ''}`} onClick={() => setMode(mode === 'draw' ? 'none' : 'draw')}>✎ Draw</button>
          <button className={`btn sm ghost ${mode === 'text' ? 'on' : ''}`} onClick={() => setMode(mode === 'text' ? 'none' : 'text')}>T Text</button>
        </div>
        {mode === 'text' && <>
          <Field label="Text (click image to place)"><textarea style={{ minHeight: 60 }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <label className="field check"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />Bold</label>
        </>}
        <Field label="Color"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        <Field label={`Size: ${size}`}><input type="range" min={8} max={300} value={size} onChange={(e) => setSize(+e.target.value)} /></Field>
        <button className="btn sm ghost" disabled={!layers.length} onClick={() => setLayers((l) => l.slice(0, -1))}>↶ Undo</button>
        <button className="btn sm ghost" onClick={() => { setAdj(defaults()); setLayers([]); }}>Reset all</button>
        <Field label="Save as">
          <select value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WEBP</option></select>
        </Field>
        <button className="btn" onClick={save}>Download</button>
        <button className="btn sm ghost" onClick={() => { setBase(null); setFile(null); }}>Open another image</button>
      </div>
      <div className="stage">
        <canvas
          ref={canvas}
          style={{ maxWidth: '100%', display: 'block', margin: '0 auto', cursor: mode === 'none' ? 'default' : 'crosshair', touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drawing.current = false)}
        />
        <Status busy={busy} error={error} />
      </div>
    </div>
  );
}
