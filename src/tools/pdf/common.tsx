import { useEffect, useState } from 'react';
import { FileDrop, Status, useRunner } from '../../components/ui';
import { formatSize, readBytes, type Bytes } from '../../lib/files';
import { pageCount } from '../../lib/pdf';

/** Single-PDF picker that reads bytes and page count, showing errors (e.g. encrypted). */
export function usePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Bytes | null>(null);
  const [pages, setPages] = useState(0);
  const r = useRunner();
  useEffect(() => {
    setBytes(null);
    setPages(0);
    if (!file) return;
    r.run(async () => {
      const b = await readBytes(file);
      setPages(await pageCount(b));
      setBytes(b);
    });
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  return { file, setFile, bytes, pages, ...r };
}

export function PdfPicker({ pdf }: { pdf: ReturnType<typeof usePdf> }) {
  if (pdf.file && pdf.bytes)
    return (
      <div className="result">
        <span className="fname">{pdf.file.name}</span>
        <span className="muted">{pdf.pages} pages · {formatSize(pdf.file.size)}</span>
        <button className="btn sm ghost" onClick={() => pdf.setFile(null)}>Change file</button>
      </div>
    );
  return <><FileDrop accept=".pdf,application/pdf" onFiles={(f) => pdf.setFile(f[0])} label="Select PDF file" /><Status busy={pdf.busy} error={pdf.error} /></>;
}

export const outName = (file: File | null, suffix: string, ext = 'pdf') => `${(file?.name ?? 'document').replace(/\.[^.]+$/, '')}-${suffix}.${ext}`;
