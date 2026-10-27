import { useState } from 'react';
import { Field, Panel, Segmented, Status } from '../../components/ui';
import { PDF_TYPE, download, formatSize } from '../../lib/files';
import { mergePdfs, rasterPdf, repairPdf } from '../../lib/pdf';
import { canvasToBytes, openPdfjs, renderAll, renderPage } from '../../lib/pdfjs';
import { PdfPicker, outName, usePdf } from './common';

const LEVELS = {
  extreme: { scale: 0.9, q: 0.45 },
  recommended: { scale: 1.3, q: 0.65 },
  low: { scale: 2, q: 0.82 },
};

export function CompressPdf() {
  const pdf = usePdf();
  const [level, setLevel] = useState<keyof typeof LEVELS>('recommended');
  const [msg, setMsg] = useState('');
  const go = () => pdf.run(async () => {
    setMsg('');
    const { scale, q } = LEVELS[level];
    const imgs = await renderAll(pdf.bytes!, scale, 'image/jpeg', q, (d, t) => pdf.setProgress(`Compressing page ${d} of ${t}…`));
    const out = await rasterPdf(imgs, scale);
    const before = pdf.bytes!.length;
    if (out.length >= before) {
      setMsg(`This PDF is already well optimized (result ${formatSize(out.length)} ≥ original ${formatSize(before)}). Try a stronger level.`);
      return;
    }
    setMsg(`${formatSize(before)} → ${formatSize(out.length)} (${Math.round((1 - out.length / before) * 100)}% smaller)`);
    download(out, outName(pdf.file, 'compressed'), PDF_TYPE);
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <>
        <Panel>
          <Segmented label="Compression level" value={level} onChange={setLevel}
            options={[['extreme', 'Smallest'], ['recommended', 'Balanced'], ['low', 'Best quality']]} />
          <button className="btn" disabled={pdf.busy} onClick={go}>Compress PDF</button>
        </Panel>
        <p className="muted">Pages are re-rendered as optimized images, so text in the result is not selectable. Run OCR afterwards if you need that.</p>
        <Status busy={pdf.busy} error={pdf.error} progress={pdf.progress} />
        {msg && <div className="status ok">{msg}</div>}
      </>}
    </>
  );
}

export function RepairPdf() {
  const pdf = usePdf();
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row">
        <button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => download(await repairPdf(pdf.bytes!), outName(pdf.file, 'repaired'), PDF_TYPE))}>Repair PDF</button>
      </div>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

const LANGS = { eng: 'English', hin: 'Hindi', spa: 'Spanish', fra: 'French', deu: 'German', por: 'Portuguese', ita: 'Italian', ara: 'Arabic', chi_sim: 'Chinese (Simplified)', jpn: 'Japanese', rus: 'Russian' };

export function OcrPdf() {
  const pdf = usePdf();
  const [lang, setLang] = useState('eng');
  const go = () => pdf.run(async () => {
    const [{ createWorker }, { default: workerUrl }, { default: coreUrl }] = await Promise.all([
      import('tesseract.js'),
      import('tesseract.js/dist/worker.min.js?url'),
      // shortcut: SIMD core only (every browser since 2023 and Electron); very old Safari can't run OCR
      import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'),
    ]);
    pdf.setProgress('Loading OCR engine and language data…');
    // OCR code ships with the app instead of running from a third-party CDN; only language data
    // (versioned, not executable) is still downloaded. Workers need absolute URLs.
    const abs = (u: string) => new URL(u, location.href).href;
    const worker = await createWorker(lang, 1, { workerPath: abs(workerUrl), corePath: abs(coreUrl), workerBlobURL: false });
    try {
      const doc = await openPdfjs(pdf.bytes!);
      const parts: Uint8Array[] = [];
      for (let i = 0; i < doc.numPages; i++) {
        pdf.setProgress(`Recognizing page ${i + 1} of ${doc.numPages}…`);
        const c = await renderPage(doc, i, 2);
        const png = await canvasToBytes(c, 'image/png');
        const { data } = await worker.recognize(new Blob([png as BlobPart]), { pdfTitle: pdf.file?.name ?? 'OCR' }, { pdf: true });
        if (!data.pdf) throw new Error('OCR engine did not return a PDF');
        parts.push(new Uint8Array(data.pdf));
      }
      pdf.setProgress('Assembling PDF…');
      download(parts.length === 1 ? parts[0] : await mergePdfs(parts), outName(pdf.file, 'ocr'), PDF_TYPE);
    } finally {
      await worker.terminate();
    }
  });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Document language">
          <select value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <button className="btn" disabled={pdf.busy} onClick={go}>Run OCR</button>
        <span className="muted">First run downloads the OCR engine and language data (a few MB). Your PDF stays on your device.</span>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} progress={pdf.progress} />
    </>
  );
}
