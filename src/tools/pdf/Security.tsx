import { useState } from 'react';
import { FileDrop, Field, Panel, Status, useRunner } from '../../components/ui';
import { PDF_TYPE, download, readBytes } from '../../lib/files';
import { isEncrypted, protectPdf, unlockPdf } from '../../lib/pdf';
import { PdfPicker, outName, usePdf } from './common';

export function ProtectPdf() {
  const pdf = usePdf();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Password"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat password"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <button className="btn" disabled={pdf.busy || !pw || pw !== pw2} onClick={() => pdf.run(async () => {
          download(await protectPdf(pdf.bytes!, pw), outName(pdf.file, 'protected'), PDF_TYPE);
        })}>Protect PDF</button>
        {pw && pw2 && pw !== pw2 && <span className="status error" style={{ margin: 0 }}>Passwords do not match</span>}
      </Panel>}
      <p className="muted">Uses AES encryption. Keep the password safe: there is no way to recover it.</p>
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function UnlockPdf() {
  // usePdf rejects encrypted files, so this tool reads bytes itself
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState('');
  const { busy, error, run } = useRunner();
  return (
    <>
      <FileDrop accept=".pdf,application/pdf" onFiles={(f) => setFile(f[0])} label="Select protected PDF" />
      {file && <Panel>
        <span className="fname">{file.name}</span>
        <Field label="Password"><input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          const b = await readBytes(file);
          if (!(await isEncrypted(b))) throw new Error('This PDF is not password protected.');
          download(await unlockPdf(b, pw), outName(file, 'unlocked'), PDF_TYPE);
        })}>Unlock PDF</button>
      </Panel>}
      <p className="muted">Only for PDFs you are allowed to open: you need the password.</p>
      <Status busy={busy} error={error} />
    </>
  );
}

