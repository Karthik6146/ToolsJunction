import { useState } from 'react';
import { Field, Panel, Status } from '../../components/ui';
import { download, downloadAll } from '../../lib/files';
import { extractText, openPdfjs, renderAll, renderPage } from '../../lib/pdfjs';
import { PdfPicker, outName, usePdf } from './common';

export function PdfToImages() {
  const pdf = usePdf();
  const [fmt, setFmt] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [dpi, setDpi] = useState(150);
  const go = () => pdf.run(async () => {
    const imgs = await renderAll(pdf.bytes!, dpi / 72, fmt, 0.9, (d, t) => pdf.setProgress(`Rendering page ${d} of ${t}…`));
    const ext = fmt === 'image/png' ? 'png' : 'jpg';
    await downloadAll(imgs.map((d, i) => ({ name: outName(pdf.file, `page${i + 1}`, ext), data: d })), outName(pdf.file, 'images', 'zip'), fmt);
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Format"><select value={fmt} onChange={(e) => setFmt(e.target.value as typeof fmt)}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></Field>
        <Field label="Resolution">
          <select value={dpi} onChange={(e) => setDpi(+e.target.value)}><option value={72}>72 DPI (screen)</option><option value={150}>150 DPI</option><option value={300}>300 DPI (print)</option></select>
        </Field>
        <button className="btn" disabled={pdf.busy} onClick={go}>Convert to images</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} progress={pdf.progress} />
    </>
  );
}

export function PdfToWord() {
  const pdf = usePdf();
  const go = () => pdf.run(async () => {
    const pages = await extractText(pdf.bytes!);
    if (!pages.some((p) => p.trim())) throw new Error('No text found. This looks like a scanned PDF: run OCR PDF first.');
    const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx');
    const children: InstanceType<typeof Paragraph>[] = [];
    pages.forEach((p, i) => {
      for (const para of p.split(/\n{2,}/)) {
        const lines = para.split('\n');
        children.push(new Paragraph({ children: lines.map((l, j) => new TextRun({ text: l, break: j ? 1 : 0 })) }));
      }
      if (i < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    });
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    download(blob, outName(pdf.file, 'converted', 'docx'));
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row"><button className="btn" disabled={pdf.busy} onClick={go}>Convert to Word</button>
        <span className="muted">Extracts text and paragraphs. Images and exact layout are not kept.</span></div>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function PdfToPpt() {
  const pdf = usePdf();
  const go = () => pdf.run(async () => {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const doc = await openPdfjs(pdf.bytes!);
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });
    const ppt = new PptxGenJS();
    const W = 10, H = (10 * first.height) / first.width; // inches, match first page aspect
    ppt.defineLayout({ name: 'PDF', width: W, height: H });
    ppt.layout = 'PDF';
    for (let i = 0; i < doc.numPages; i++) {
      pdf.setProgress(`Converting page ${i + 1} of ${doc.numPages}…`);
      const c = await renderPage(doc, i, 2);
      const slide = ppt.addSlide();
      const k = Math.min(W / c.width, H / c.height);
      slide.addImage({ data: c.toDataURL('image/jpeg', 0.9), x: (W - c.width * k) / 2, y: (H - c.height * k) / 2, w: c.width * k, h: c.height * k });
    }
    download(await ppt.write({ outputType: 'blob' }) as Blob, outName(pdf.file, 'slides', 'pptx'));
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row"><button className="btn" disabled={pdf.busy} onClick={go}>Convert to PowerPoint</button>
        <span className="muted">Each page becomes a slide image.</span></div>}
      <Status busy={pdf.busy} error={pdf.error} progress={pdf.progress} />
    </>
  );
}

export function PdfToExcel() {
  const pdf = usePdf();
  const go = () => pdf.run(async () => {
    const pages = await extractText(pdf.bytes!);
    if (!pages.some((p) => p.trim())) throw new Error('No text found. This looks like a scanned PDF: run OCR PDF first.');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    pages.forEach((p, i) => {
      // columns are guessed from runs of 2+ spaces / wide gaps
      const rows = p.split('\n').map((l) => l.split(/\s{2,}|\t/).map((c) => {
        const t = c.trim();
        return /^-?[\d,]+(\.\d+)?$/.test(t) ? Number(t.replace(/,/g, '')) : t;
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Page ${i + 1}`);
    });
    download(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), outName(pdf.file, 'converted', 'xlsx'));
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row"><button className="btn" disabled={pdf.busy} onClick={go}>Convert to Excel</button>
        <span className="muted">One sheet per page. Works best with simple tables.</span></div>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function PdfToText() {
  const pdf = usePdf();
  const [text, setText] = useState('');
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row">
        <button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => {
          const pages = await extractText(pdf.bytes!);
          setText(pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n'));
        })}>Extract text</button>
        {text && <>
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
          <button className="btn ghost" onClick={() => download(new Blob([text], { type: 'text/plain' }), outName(pdf.file, 'text', 'txt'))}>Download .txt</button>
        </>}
      </div>}
      <Status busy={pdf.busy} error={pdf.error} />
      {text && <textarea readOnly value={text} style={{ marginTop: 16, minHeight: 400 }} />}
    </>
  );
}
