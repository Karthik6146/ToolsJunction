import { useEffect, useState, type ReactNode } from 'react';
import { FileDrop, FileList, Field, Panel, Segmented, Status, Toggle, useFiles, useRunner } from '../../components/ui';
import { baseName, download, downloadAll, formatSize } from '../../lib/files';
import { EXT, canvasToBlob, drawToCanvas, fitDims, fitToSize, loadImage, needsBg } from '../../lib/image';

type Out = { name: string; blob: Blob; from: number; w?: number; h?: number };

/** Shared shell for tools that turn each input image into one output image. */
function BatchImage({ options, process, action }: {
  options: ReactNode;
  process: (f: File) => Promise<{ blob: Blob; ext: string; w?: number; h?: number }>;
  action: string;
}) {
  const { files, add, remove } = useFiles();
  const { busy, error, progress, setProgress, run } = useRunner();
  const [out, setOut] = useState<Out[]>([]);
  useEffect(() => setOut([]), [files]);

  const go = () => run(async () => {
    const res: Out[] = [];
    for (const [i, f] of files.entries()) {
      setProgress(`Processing ${i + 1} of ${files.length}…`);
      const r = await process(f);
      res.push({ name: `${baseName(f.name)}.${r.ext}`, blob: r.blob, from: f.size, w: r.w, h: r.h });
    }
    setOut(res);
  });

  return (
    <>
      <FileDrop accept="image/*" multiple onFiles={add} label="Select images" />
      {files.length > 0 && <>
        <FileList files={files} onRemove={remove} />
        <Panel>{options}</Panel>
        <div className="row"><button className="btn" disabled={busy} onClick={go}>{action}</button></div>
      </>}
      <Status busy={busy} error={error} progress={progress} />
      {out.length > 0 && (
        <div className="results">
          {out.map((o, i) => (
            <div className="result" key={i}>
              <span className="fname">{o.name}</span>
              {o.w && <span className="muted">{o.w}×{o.h}</span>}
              <span className="muted">{formatSize(o.from)} → <span className={o.blob.size < o.from ? 'good' : ''}>{formatSize(o.blob.size)}</span></span>
              <button className="btn sm" onClick={() => download(o.blob, o.name)}>Download</button>
            </div>
          ))}
          {out.length > 1 && <div><button className="btn" onClick={() => downloadAll(out.map((o) => ({ name: o.name, data: o.blob })), 'images.zip')}>Download all (ZIP)</button></div>}
        </div>
      )}
    </>
  );
}

type Fmt = 'keep' | 'image/jpeg' | 'image/png' | 'image/webp';
const outType = (f: File, fmt: Fmt) => (fmt === 'keep' ? (EXT[f.type] ? f.type : 'image/png') : fmt);

function FormatSelect({ value, onChange, keep = true }: { value: Fmt; onChange: (v: Fmt) => void; keep?: boolean }) {
  const opts: [Fmt, string][] = [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WEBP']];
  return <Segmented label="Format" value={value} onChange={onChange} options={keep ? [['keep', 'Original'], ...opts] : opts} />;
}

export function ResizeImage() {
  const [mode, setMode] = useState<'px' | 'percent' | 'size'>('px');
  const [width, setW] = useState(1280);
  const [height, setH] = useState(0);
  const [percent, setP] = useState(50);
  const [kb, setKb] = useState(200);
  const [keepRatio, setKR] = useState(true);
  const [fmt, setFmt] = useState<Fmt>('keep');
  const [quality, setQ] = useState(90);

  return (
    <BatchImage
      action="Resize images"
      options={<>
        <Segmented label="Resize by" value={mode} onChange={setMode} options={[['px', 'Pixels'], ['percent', 'Percent'], ['size', 'File size']]} />
        {mode === 'px' && <>
          <Field label="Width (px)"><input type="number" min={0} placeholder="Auto" value={width || ''} onChange={(e) => setW(+e.target.value)} /></Field>
          <Field label="Height (px)"><input type="number" min={0} placeholder="Auto" value={height || ''} onChange={(e) => setH(+e.target.value)} /></Field>
          <Toggle label="Keep aspect ratio" checked={keepRatio} onChange={setKR} />
        </>}
        {mode === 'percent' && <Field label="Scale" value={`${percent}%`}><input type="range" min={1} max={200} value={percent} onChange={(e) => setP(+e.target.value)} /></Field>}
        {mode === 'size' && <Field label="Max size (KB)"><input type="number" min={5} value={kb} onChange={(e) => setKb(+e.target.value)} /></Field>}
        <FormatSelect value={fmt} onChange={setFmt} />
        {mode !== 'size' && <Field label="Quality" value={`${quality}%`}><input type="range" min={10} max={100} value={quality} onChange={(e) => setQ(+e.target.value)} /></Field>}
      </>}
      process={async (f) => {
        const img = await loadImage(f);
        const type = mode === 'size' && fmt === 'keep' && f.type === 'image/png' ? 'image/jpeg' : outType(f, fmt);
        const bg = needsBg(type) ? '#ffffff' : undefined;
        if (mode === 'size') {
          const blob = await fitToSize(drawToCanvas(img, img.naturalWidth, img.naturalHeight, bg), type, kb * 1024);
          const dims = await loadImage(blob);
          return { blob, ext: EXT[type], w: dims.naturalWidth, h: dims.naturalHeight };
        }
        const d = fitDims(img.naturalWidth, img.naturalHeight, { mode, width, height, percent, keepRatio });
        const blob = await canvasToBlob(drawToCanvas(img, d.w, d.h, bg), type, quality / 100);
        return { blob, ext: EXT[type], w: d.w, h: d.h };
      }}
    />
  );
}

export function CompressImage() {
  const [quality, setQ] = useState(70);
  const [fmt, setFmt] = useState<Fmt>('keep');
  const [maxW, setMaxW] = useState(0);
  return (
    <BatchImage
      action="Compress images"
      options={<>
        <Field label="Quality" value={`${quality}%`}><input type="range" min={10} max={95} value={quality} onChange={(e) => setQ(+e.target.value)} /></Field>
        <FormatSelect value={fmt} onChange={setFmt} />
        <Field label="Max width (px, 0 = keep)"><input type="number" min={0} value={maxW} onChange={(e) => setMaxW(+e.target.value)} /></Field>
        <span className="muted">PNG is lossless: choose JPG or WEBP for the biggest savings.</span>
      </>}
      process={async (f) => {
        const img = await loadImage(f);
        const type = outType(f, fmt);
        const s = maxW && img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        let blob = await canvasToBlob(drawToCanvas(img, w, h, needsBg(type) ? '#fff' : undefined), type, quality / 100);
        // never hand back a bigger file in the same format
        if (blob.size >= f.size && type === f.type && s === 1) blob = f;
        return { blob, ext: EXT[type], w, h };
      }}
    />
  );
}

export function ConvertImage() {
  const [fmt, setFmt] = useState<Fmt>('image/jpeg');
  const [quality, setQ] = useState(92);
  const [bg, setBg] = useState('#ffffff');
  return (
    <BatchImage
      action="Convert images"
      options={<>
        <FormatSelect value={fmt} onChange={setFmt} keep={false} />
        <Field label="Quality" value={`${quality}%`}><input type="range" min={10} max={100} value={quality} onChange={(e) => setQ(+e.target.value)} /></Field>
        {fmt === 'image/jpeg' && <Field label="Background for transparency"><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>}
      </>}
      process={async (f) => {
        const img = await loadImage(f);
        const type = fmt as string;
        const blob = await canvasToBlob(drawToCanvas(img, img.naturalWidth, img.naturalHeight, type === 'image/jpeg' ? bg : undefined), type, quality / 100);
        return { blob, ext: EXT[type], w: img.naturalWidth, h: img.naturalHeight };
      }}
    />
  );
}

export function rotateFlip(img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, deg: number, flipH: boolean, flipV: boolean) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const swap = deg % 180 !== 0;
  const c = document.createElement('canvas');
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -w / 2, -h / 2);
  return c;
}

export function RotateImage() {
  const [deg, setDeg] = useState(90);
  const [flipH, setFH] = useState(false);
  const [flipV, setFV] = useState(false);
  return (
    <BatchImage
      action="Apply"
      options={<>
        <Field label="Rotate">
          <select value={deg} onChange={(e) => setDeg(+e.target.value)}>
            <option value={0}>No rotation</option>
            <option value={90}>90° clockwise</option>
            <option value={180}>180°</option>
            <option value={270}>90° counter-clockwise</option>
          </select>
        </Field>
        <label className="field check"><input type="checkbox" checked={flipH} onChange={(e) => setFH(e.target.checked)} />Flip horizontal</label>
        <label className="field check"><input type="checkbox" checked={flipV} onChange={(e) => setFV(e.target.checked)} />Flip vertical</label>
      </>}
      process={async (f) => {
        const img = await loadImage(f);
        const type = EXT[f.type] ? f.type : 'image/png';
        const c = rotateFlip(img, deg, flipH, flipV);
        return { blob: await canvasToBlob(c, type, 0.95), ext: EXT[type], w: c.width, h: c.height };
      }}
    />
  );
}

export function ImageBase64() {
  const { files, add, remove } = useFiles();
  const [out, setOut] = useState<{ name: string; data: string }[]>([]);
  const { busy, error, run } = useRunner();
  useEffect(() => {
    run(async () => {
      setOut(await Promise.all(files.map((f) => new Promise<{ name: string; data: string }>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res({ name: f.name, data: r.result as string });
        r.onerror = () => rej(new Error(`Could not read ${f.name}`));
        r.readAsDataURL(f);
      }))));
    });
  }, [files, run]);
  return (
    <>
      <FileDrop accept="image/*" multiple onFiles={add} label="Select images" />
      {files.length > 0 && <FileList files={files} onRemove={remove} />}
      <Status busy={busy} error={error} />
      {out.map((o) => (
        <div key={o.name} style={{ marginTop: 16 }}>
          <div className="row" style={{ marginTop: 0 }}>
            <b>{o.name}</b>
            <span className="muted">{formatSize(o.data.length)}</span>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(o.data)}>Copy data URL</button>
            <button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(`<img src="${o.data}" alt="">`)}>Copy &lt;img&gt;</button>
          </div>
          <pre className="out">{o.data.length > 5000 ? o.data.slice(0, 5000) + '… (truncated in preview, copy gets all)' : o.data}</pre>
        </div>
      ))}
    </>
  );
}
