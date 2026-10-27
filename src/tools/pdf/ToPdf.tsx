import { useState } from 'react';
import { FileDrop, FileList, Field, Panel, Status, useFiles, useRunner } from '../../components/ui';
import { PDF_TYPE, baseName, download, readBytes } from '../../lib/files';
import { imagesToPdf, textToPdf, type PageSize } from '../../lib/pdf';
import { canvasToBlob, drawToCanvas, loadImage } from '../../lib/image';
import { docxToHtml, esc, htmlToPdf, sheetToHtml } from '../../lib/convert';

export function ImagesToPdf() {
  const { files, add, remove, move } = useFiles();
  const { busy, error, run } = useRunner();
  const [pageSize, setPS] = useState<PageSize>('a4');
  const [margin, setMargin] = useState(20);
  const [orient, setOrient] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const go = () => run(async () => {
    const imgs = await Promise.all(files.map(async (f) => {
      if (f.type === 'image/jpeg') return { bytes: await readBytes(f), type: 'jpg' as const };
      if (f.type === 'image/png') return { bytes: await readBytes(f), type: 'png' as const };
      // other formats (webp, gif, bmp…) are re-encoded as JPEG
      const img = await loadImage(f);
      return { bytes: await readBytes(await canvasToBlob(drawToCanvas(img, img.naturalWidth, img.naturalHeight, '#fff'), 'image/jpeg', 0.92)), type: 'jpg' as const };
    }));
    const landscape = orient === 'auto' ? undefined : orient === 'landscape';
    download(await imagesToPdf(imgs, { pageSize, margin, landscape }), files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf', PDF_TYPE);
  });
  return (
    <>
      <FileDrop accept="image/*" multiple onFiles={add} label="Select images" />
      {files.length > 0 && <>
        <FileList files={files} onRemove={remove} onMove={move} />
        <Panel>
          <Field label="Page size">
            <select value={pageSize} onChange={(e) => setPS(e.target.value as PageSize)}>
              <option value="a4">A4</option><option value="letter">US Letter</option><option value="fit">Same as image</option>
            </select>
          </Field>
          {pageSize !== 'fit' && <Field label="Orientation">
            <select value={orient} onChange={(e) => setOrient(e.target.value as typeof orient)}>
              <option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
            </select>
          </Field>}
          <Field label="Margin (pt)"><input type="number" min={0} max={100} value={margin} onChange={(e) => setMargin(+e.target.value)} /></Field>
          <button className="btn" disabled={busy} onClick={go}>Convert to PDF</button>
        </Panel>
      </>}
      <Status busy={busy} error={error} />
    </>
  );
}

/** One input file -> HTML -> PDF. */
function HtmlBased({ accept, label, toHtml }: { accept: string; label: string; toHtml: (f: File) => Promise<string> }) {
  const { busy, error, run } = useRunner();
  const [landscape, setLand] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <FileDrop accept={accept} onFiles={(f) => setFile(f[0])} label={label} />
      {file && <Panel>
        <span className="fname">{file.name}</span>
        <label className="field check"><input type="checkbox" checked={landscape} onChange={(e) => setLand(e.target.checked)} />Landscape</label>
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          download(await htmlToPdf(await toHtml(file), { landscape }), `${baseName(file.name)}.pdf`);
        })}>Convert to PDF</button>
      </Panel>}
      <p className="muted">Basic-fidelity conversion done in your browser: complex layouts, headers/footers and some fonts may differ from the original.</p>
      <Status busy={busy} error={error} />
    </>
  );
}

export function WordToPdf() {
  return <HtmlBased accept=".docx" label="Select Word file (.docx)" toHtml={async (f) => docxToHtml(await readBytes(f))} />;
}

export function ExcelToPdf() {
  return <HtmlBased accept=".xlsx,.xls,.csv,.ods" label="Select spreadsheet" toHtml={async (f) => {
    const sheets = await sheetToHtml(await readBytes(f));
    return sheets.map((s) => `<h3>${esc(s.name)}</h3>${s.html}`).join('<div style="height:24px"></div>');
  }} />;
}

export function HtmlToPdf() {
  const { busy, error, run } = useRunner();
  const [html, setHtml] = useState('<h1>Hello</h1>\n<p>Paste or load your HTML here.</p>');
  const [landscape, setLand] = useState(false);
  return (
    <>
      <FileDrop accept=".html,.htm" onFiles={async (f) => setHtml(await f[0].text())} label="Load HTML file" />
      <Panel>
        <Field label="HTML"><textarea value={html} onChange={(e) => setHtml(e.target.value)} style={{ minWidth: 'min(860px, 80vw)', fontFamily: 'monospace' }} /></Field>
        <label className="field check"><input type="checkbox" checked={landscape} onChange={(e) => setLand(e.target.checked)} />Landscape</label>
        <button className="btn" disabled={busy || !html.trim()} onClick={() => run(async () => download(await htmlToPdf(html, { landscape }), 'page.pdf'))}>Convert to PDF</button>
      </Panel>
      <p className="muted">For your safety, scripts don't run and nothing outside the file is loaded (web images, local files, network shares). Embedded images (data: URLs) still appear.</p>
      <Status busy={busy} error={error} />
    </>
  );
}

export function TextToPdf() {
  const { busy, error, run } = useRunner();
  const [text, setText] = useState('');
  const [size, setSize] = useState(11);
  return (
    <>
      <FileDrop accept=".txt,.md,.csv,.log,.json,text/plain" onFiles={async (f) => setText(await f[0].text())} label="Load text file" />
      <Panel>
        <Field label="Text"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text…" style={{ minWidth: 'min(860px, 80vw)' }} /></Field>
        <Field label="Font size"><input type="number" min={6} max={36} value={size} onChange={(e) => setSize(+e.target.value)} /></Field>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => run(async () => download(await textToPdf(text, size), 'text.pdf', PDF_TYPE))}>Convert to PDF</button>
      </Panel>
      <Status busy={busy} error={error} />
    </>
  );
}
