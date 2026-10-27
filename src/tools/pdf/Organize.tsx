import { useEffect, useState } from 'react';
import { FileDrop, FileList, Field, Panel, Status, useFiles, useRunner } from '../../components/ui';
import { PageThumbs, useThumbs, type PageItem } from '../../components/PageThumbs';
import { PDF_TYPE, download, downloadAll, readBytes } from '../../lib/files';
import { mergePdfs, organizePages, parseRanges, rotatePages, selectPages, splitPdf } from '../../lib/pdf';
import { PdfPicker, outName, usePdf } from './common';

export function MergePdf() {
  const { files, add, remove, move } = useFiles();
  const { busy, error, run } = useRunner();
  return (
    <>
      <FileDrop accept=".pdf,application/pdf" multiple onFiles={add} label="Select PDF files" />
      {files.length > 0 && <>
        <FileList files={files} onRemove={remove} onMove={move} />
        <div className="row">
          <button className="btn" disabled={busy || files.length < 2} onClick={() => run(async () => {
            download(await mergePdfs(await Promise.all(files.map(readBytes))), 'merged.pdf', PDF_TYPE);
          })}>Merge {files.length} PDFs</button>
          {files.length < 2 && <span className="muted">Add at least 2 files.</span>}
        </div>
      </>}
      <Status busy={busy} error={error} />
    </>
  );
}

export function SplitPdf() {
  const pdf = usePdf();
  const [mode, setMode] = useState<'ranges' | 'every' | 'n'>('ranges');
  const [spec, setSpec] = useState('1-2, 3');
  const [n, setN] = useState(2);
  const go = () => pdf.run(async () => {
    const all = Array.from({ length: pdf.pages }, (_, i) => i);
    const ranges = mode === 'ranges' ? parseRanges(spec, pdf.pages)
      : mode === 'every' ? all.map((i) => [i])
      : Array.from({ length: Math.ceil(pdf.pages / n) }, (_, k) => all.slice(k * n, k * n + n));
    const parts = await splitPdf(pdf.bytes!, ranges);
    await downloadAll(parts.map((d, i) => ({ name: outName(pdf.file, `part${i + 1}`), data: d })), outName(pdf.file, 'split', 'zip'), PDF_TYPE);
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <>
        <Panel>
          <Field label="Split mode">
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="ranges">Custom ranges</option>
              <option value="every">Every page</option>
              <option value="n">Every N pages</option>
            </select>
          </Field>
          {mode === 'ranges' && <Field label="Ranges (each becomes a file)"><input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="1-3, 4-6, 7" /></Field>}
          {mode === 'n' && <Field label="Pages per file"><input type="number" min={1} value={n} onChange={(e) => setN(Math.max(1, +e.target.value))} /></Field>}
          <button className="btn" disabled={pdf.busy} onClick={go}>Split PDF</button>
        </Panel>
        <Status busy={pdf.busy} error={pdf.error} />
      </>}
    </>
  );
}

/** Pick pages visually or by range text; used by Remove, Extract and Rotate. */
function PageSelectTool({ action, apply }: { action: string; apply: (bytes: Uint8Array, sel: number[], pages: number, file: File | null) => Promise<void> }) {
  const pdf = usePdf();
  const { thumbs, err } = useThumbs(pdf.bytes);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [spec, setSpec] = useState('');
  useEffect(() => setSel(new Set()), [pdf.bytes]);
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const pages: PageItem[] = Array.from({ length: pdf.pages }, (_, i) => ({ index: i, rotate: 0 }));
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <>
        <Panel>
          <Field label="Pages (e.g. 1-3, 8) or click thumbnails">
            <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="1-3, 8" />
          </Field>
          <button className="btn ghost" onClick={() => pdf.run(async () => setSel(new Set(parseRanges(spec, pdf.pages).flat())))}>Select range</button>
          <button className="btn ghost" onClick={() => setSel(new Set(pages.map((p) => p.index)))}>All</button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>None</button>
          <button className="btn" disabled={pdf.busy || !sel.size} onClick={() => pdf.run(() => apply(pdf.bytes!, [...sel].sort((a, b) => a - b), pdf.pages, pdf.file))}>
            {action} ({sel.size})
          </button>
        </Panel>
        <Status busy={pdf.busy} error={pdf.error || err} />
        <PageThumbs thumbs={thumbs} pages={pages} selected={sel} onToggle={toggle} />
      </>}
    </>
  );
}

export function RemovePages() {
  return <PageSelectTool action="Remove selected pages" apply={async (b, sel, n, f) => {
    const keep = Array.from({ length: n }, (_, i) => i).filter((i) => !sel.includes(i));
    if (!keep.length) throw new Error('Cannot remove every page');
    download(await selectPages(b, keep), outName(f, 'removed'), PDF_TYPE);
  }} />;
}

export function ExtractPages() {
  return <PageSelectTool action="Extract selected pages" apply={async (b, sel, _n, f) => {
    download(await selectPages(b, sel), outName(f, 'extracted'), PDF_TYPE);
  }} />;
}

export function RotatePdf() {
  const [deg, setDeg] = useState<90 | 180 | 270>(90);
  return (
    <>
      <Panel>
        <Field label="Rotation">
          <select value={deg} onChange={(e) => setDeg(+e.target.value as 90)}>
            <option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>90° counter-clockwise</option>
          </select>
        </Field>
        <span className="muted">Select pages below, or All.</span>
      </Panel>
      <PageSelectTool action="Rotate selected pages" apply={async (b, sel, _n, f) => {
        download(await rotatePages(b, sel, deg), outName(f, 'rotated'), PDF_TYPE);
      }} />
    </>
  );
}

export function OrganizePdf() {
  const pdf = usePdf();
  const { thumbs, err } = useThumbs(pdf.bytes);
  const [pages, setPages] = useState<PageItem[]>([]);
  useEffect(() => setPages(Array.from({ length: pdf.pages }, (_, i) => ({ index: i, rotate: 0 }))), [pdf.pages, pdf.bytes]);
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <>
        <Panel>
          <span className="muted">Drag pages to reorder. Use ↻ to rotate and ✕ to delete.</span>
          <button className="btn ghost" onClick={() => setPages([...pages].reverse())}>Reverse order</button>
          <button className="btn ghost" onClick={() => setPages(Array.from({ length: pdf.pages }, (_, i) => ({ index: i, rotate: 0 })))}>Reset</button>
          <button className="btn" disabled={pdf.busy || !pages.length} onClick={() => pdf.run(async () => {
            download(await organizePages(pdf.bytes!, pages), outName(pdf.file, 'organized'), PDF_TYPE);
          })}>Save PDF</button>
        </Panel>
        <Status busy={pdf.busy} error={pdf.error || err} />
        <PageThumbs
          thumbs={thumbs}
          pages={pages}
          onRotate={(pos) => setPages((p) => p.map((x, i) => (i === pos ? { ...x, rotate: (x.rotate + 90) % 360 } : x)))}
          onDelete={(pos) => setPages((p) => p.filter((_, i) => i !== pos))}
          onReorder={(from, to) => setPages((p) => { const a = [...p]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; })}
        />
      </>}
    </>
  );
}
