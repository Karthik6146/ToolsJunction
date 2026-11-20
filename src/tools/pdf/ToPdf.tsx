import { useState } from 'react';
import { FileDrop, Field, Panel, Status, useRunner } from '../../components/ui';
import { PDF_TYPE, baseName, download, readBytes } from '../../lib/files';
import { textToPdf } from '../../lib/pdf';
import { docxToHtml, esc, htmlToPdf, sheetToHtml } from '../../lib/convert';

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
