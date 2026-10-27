import { useEffect, useRef, useState } from 'react';
import { FileDrop, Field, Panel, Status, useRunner } from '../../components/ui';
import { baseName, download } from '../../lib/files';
import { EXT, canvasToBlob, loadImage } from '../../lib/image';

type Box = { x: number; y: number; w: number; h: number };
const RATIOS: Record<string, number | null> = { Free: null, '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9, '9:16': 9 / 16, '3:4': 3 / 4 };

export function CropImage() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [ratio, setRatio] = useState('Free');
  const { busy, error, run } = useRunner();
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; b: Box } | null>(null);

  useEffect(() => {
    if (!file) return;
    run(async () => {
      const i = await loadImage(file);
      setImg(i);
      setBox({ x: 0, y: 0, w: i.naturalWidth, h: i.naturalHeight });
    });
  }, [file, run]);

  // display scale: image px per screen px
  const scale = () => (img && stage.current ? img.naturalWidth / stage.current.clientWidth : 1);

  const clamp = (b: Box): Box => {
    if (!img) return b;
    const w = Math.max(10, Math.min(b.w, img.naturalWidth));
    const h = Math.max(10, Math.min(b.h, img.naturalHeight));
    return { w, h, x: Math.min(Math.max(0, b.x), img.naturalWidth - w), y: Math.min(Math.max(0, b.y), img.naturalHeight - h) };
  };

  const applyRatio = (r: string) => {
    setRatio(r);
    const k = RATIOS[r];
    if (!k || !img) return;
    let w = img.naturalWidth, h = w / k;
    if (h > img.naturalHeight) { h = img.naturalHeight; w = h * k; }
    setBox(clamp({ x: (img.naturalWidth - w) / 2, y: (img.naturalHeight - h) / 2, w, h }));
  };

  const onDown = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, b: box };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = scale();
    const dx = (e.clientX - d.sx) * s, dy = (e.clientY - d.sy) * s;
    if (d.mode === 'move') setBox(clamp({ ...d.b, x: d.b.x + dx, y: d.b.y + dy }));
    else {
      const k = RATIOS[ratio];
      const w = d.b.w + dx;
      setBox(clamp({ ...d.b, w, h: k ? w / k : d.b.h + dy }));
    }
  };

  const save = () => run(async () => {
    if (!img || !file) return;
    const c = document.createElement('canvas');
    c.width = Math.round(box.w);
    c.height = Math.round(box.h);
    c.getContext('2d')!.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    const type = EXT[file.type] ? file.type : 'image/png';
    download(await canvasToBlob(c, type, 0.95), `${baseName(file.name)}-cropped.${EXT[type]}`);
  });

  const num = (k: keyof Box) => (
    <Field label={k.toUpperCase()}>
      <input type="number" value={Math.round(box[k])} onChange={(e) => setBox(clamp({ ...box, [k]: +e.target.value }))} />
    </Field>
  );

  if (!img) return <><FileDrop accept="image/*" onFiles={(f) => setFile(f[0])} label="Select image" /><Status busy={busy} error={error} /></>;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <>
      <Panel>
        <Field label="Aspect ratio">
          <select value={ratio} onChange={(e) => applyRatio(e.target.value)}>{Object.keys(RATIOS).map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        {num('x')}{num('y')}{num('w')}{num('h')}
        <button className="btn" onClick={save} disabled={busy}>Crop & download</button>
        <button className="btn ghost" onClick={() => { setImg(null); setFile(null); }}>Change image</button>
      </Panel>
      <div ref={stage} style={{ position: 'relative', marginTop: 16, touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <img src={img.src} alt="To crop" style={{ width: '100%', display: 'block', borderRadius: 8 }} draggable={false} />
        <div
          style={{
            position: 'absolute', left: pct(box.x, img.naturalWidth), top: pct(box.y, img.naturalHeight),
            width: pct(box.w, img.naturalWidth), height: pct(box.h, img.naturalHeight),
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)', outline: '2px solid #fff', cursor: 'move',
          }}
          onPointerDown={(e) => onDown(e, 'move')}
        >
          <span
            onPointerDown={(e) => onDown(e, 'resize')}
            style={{ position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, background: '#fff', borderRadius: 4, cursor: 'nwse-resize' }}
          />
        </div>
      </div>
      <Status busy={busy} error={error} />
    </>
  );
}
