// "Uploads" library for the photo editor: kept in this browser's IndexedDB, never sent anywhere.
import { readBytes } from '../../../lib/files';

export interface Upload { id: number; name: string; blob: Blob; added: number }
const DB = 'tj-uploads', STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

// storage can be unavailable (private window, blocked site data): the editor still works, uploads just aren't kept
export const listUploads = () => tx<Upload[]>('readonly', (s) => s.getAll()).then((u) => u.reverse()).catch(() => [] as Upload[]);
export const saveUpload = (name: string, blob: Blob) => tx<IDBValidKey>('readwrite', (s) => s.add({ name, blob, added: Date.now() })).then(Number).catch(() => -Date.now());
export const deleteUpload = (id: number) => tx('readwrite', (s) => s.delete(id)).catch(() => undefined);

const MAX_PDF_PAGES = 30;

/** Turns any supported file into image blobs: images as-is, each PDF page rendered to PNG. */
export async function fileToImages(f: File): Promise<{ name: string; blob: Blob }[]> {
  if (f.type.startsWith('image/')) return [{ name: f.name, blob: f }];
  if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
    const { openPdfjs, renderPage } = await import('../../../lib/pdfjs');
    const doc = await openPdfjs(await readBytes(f));
    const out: { name: string; blob: Blob }[] = [];
    for (let i = 0; i < Math.min(doc.numPages, MAX_PDF_PAGES); i++) {
      const c = await renderPage(doc, i, 2);
      out.push({ name: `${f.name} · page ${i + 1}`, blob: await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Render failed'))), 'image/png')) });
    }
    return out;
  }
  throw new Error(`${f.name}: only images (JPG, PNG, WEBP, GIF, SVG…) and PDFs can be added`);
}
