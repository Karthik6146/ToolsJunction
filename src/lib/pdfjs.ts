import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Bytes } from './files';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy };

export async function openPdfjs(bytes: Bytes, password?: string): Promise<PDFDocumentProxy> {
  try {
    // pdf.js transfers the buffer to its worker, so give it a copy
    return await pdfjs.getDocument({ data: bytes.slice(), password }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException')
      throw new Error(password ? 'Wrong password' : 'PDF is password protected, unlock it first');
    throw e;
  }
}

/** Renders a page to a new canvas. scale 1 = 72 dpi (1 css px per PDF point). */
export async function renderPage(doc: PDFDocumentProxy, index: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

/** Text per page, lines rebuilt from item y positions. */
export async function extractText(bytes: Bytes, password?: string): Promise<string[]> {
  const doc = await openPdfjs(bytes, password);
  return Promise.all(Array.from({ length: doc.numPages }, (_, i) => pageText(doc, i)));
}

export async function pageText(doc: PDFDocumentProxy, index: number): Promise<string> {
  const page = await doc.getPage(index + 1);
  const tc = await page.getTextContent();
  let out = '';
  let lastY: number | null = null;
  let lastEnd = 0;
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const [, , , , x, y] = it.transform as number[];
    if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
    else if (lastY !== null && x - lastEnd > 3 && !out.endsWith(' ')) out += x - lastEnd > 20 ? '    ' : ' ';
    out += it.str;
    lastY = y;
    lastEnd = x + it.width;
    if (it.hasEOL) { out += '\n'; lastY = null; }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function canvasToBytes(c: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Bytes> {
  return new Promise((res, rej) =>
    c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('Canvas export failed'))), type, quality),
  );
}

/** Render every page to JPEG/PNG bytes. */
export async function renderAll(
  bytes: Bytes,
  scale: number,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.85,
  onProgress?: (done: number, total: number) => void,
): Promise<Bytes[]> {
  const doc = await openPdfjs(bytes);
  const out: Bytes[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const c = await renderPage(doc, i, scale);
    out.push(await canvasToBytes(c, type, quality));
    c.width = c.height = 0;
    onProgress?.(i + 1, doc.numPages);
  }
  return out;
}
