import { PDFDocument, StandardFonts, degrees, rgb, EncryptedPDFError } from '@cantoo/pdf-lib';
import type { Bytes } from './files';

export { PDFDocument };

export async function loadPdf(bytes: Bytes, password?: string): Promise<PDFDocument> {
  try {
    const doc = await PDFDocument.load(bytes, { password, updateMetadata: false });
    if (doc.isEncrypted && !password) throw new Error('PDF is password protected, unlock it first');
    return doc;
  } catch (e) {
    if (e instanceof EncryptedPDFError || /is encrypted/.test(String((e as Error)?.message))) throw new Error('PDF is password protected, unlock it first');
    throw e;
  }
}

/** "1-3, 5" -> [[0,1,2],[4]]. 1-based input, 0-based output. "3-1" gives reversed order. */
export function parseRanges(spec: string, pageCount: number): number[][] {
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter at least one page or range, e.g. 1-3, 5');
  return parts.map((p) => {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
    if (!m) throw new Error(`"${p}" is not a valid page or range`);
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    for (const n of [a, b]) if (n < 1 || n > pageCount) throw new Error(`Page ${n} does not exist (document has ${pageCount} pages)`);
    const out: number[] = [];
    for (let i = a; a <= b ? i <= b : i >= b; a <= b ? i++ : i--) out.push(i - 1);
    return out;
  });
}

async function copyInto(target: PDFDocument, src: PDFDocument, indices: number[]) {
  const pages = await target.copyPages(src, indices);
  pages.forEach((p) => target.addPage(p));
}

export async function mergePdfs(files: Bytes[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await loadPdf(f);
    await copyInto(out, src, src.getPageIndices());
  }
  return out.save();
}

export async function selectPages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  if (!indices.length) throw new Error('No pages selected');
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  await copyInto(out, src, indices);
  return out.save();
}

export async function splitPdf(bytes: Bytes, ranges: number[][]): Promise<Bytes[]> {
  return Promise.all(ranges.map((r) => selectPages(bytes, r)));
}

export async function rotatePages(bytes: Bytes, indices: number[] | 'all', deg: 90 | 180 | 270): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  for (const i of indices === 'all' ? doc.getPageIndices() : indices) {
    const p = pages[i];
    p.setRotation(degrees((p.getRotation().angle + deg) % 360));
  }
  return doc.save();
}

/** Apply per-page rotation + order in one pass (Organize tool). */
export async function organizePages(bytes: Bytes, pages: { index: number; rotate: number }[]): Promise<Bytes> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p.index));
  copied.forEach((pg, i) => {
    pg.setRotation(degrees((pg.getRotation().angle + pages[i].rotate) % 360));
    out.addPage(pg);
  });
  return out.save();
}

export function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function watermark(
  bytes: Bytes,
  o: { text: string; size: number; opacity: number; rotate: number; color: string },
): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const tw = font.widthOfTextAtSize(o.text, o.size);
    const rad = (o.rotate * Math.PI) / 180;
    // center the rotated text on the page
    const x = width / 2 - (tw / 2) * Math.cos(rad) + (o.size / 3) * Math.sin(rad);
    const y = height / 2 - (tw / 2) * Math.sin(rad) - (o.size / 3) * Math.cos(rad);
    page.drawText(o.text, { x, y, size: o.size, font, color: hexToRgb(o.color), opacity: o.opacity, rotate: degrees(o.rotate) });
  }
  return doc.save();
}

export type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center';

export async function pageNumbers(bytes: Bytes, o: { position: NumberPosition; start: number; format: string; size: number }): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = o.format.replace('{n}', String(i + o.start)).replace('{total}', String(pages.length + o.start - 1));
    const { width, height } = page.getSize();
    const tw = font.widthOfTextAtSize(text, o.size);
    const m = 24;
    const x = o.position.endsWith('center') ? (width - tw) / 2 : o.position.endsWith('right') ? width - tw - m : m;
    const y = o.position.startsWith('top') ? height - m - o.size : m;
    page.drawText(text, { x, y, size: o.size, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return doc.save();
}

/** Margins in points trimmed from each side of every page. */
export async function cropPdf(bytes: Bytes, m: { top: number; right: number; bottom: number; left: number }): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  for (const page of doc.getPages()) {
    const box = page.getCropBox();
    const w = box.width - m.left - m.right;
    const h = box.height - m.top - m.bottom;
    if (w <= 10 || h <= 10) throw new Error('Margins are larger than the page');
    page.setCropBox(box.x + m.left, box.y + m.bottom, w, h);
    page.setMediaBox(box.x + m.left, box.y + m.bottom, w, h);
  }
  return doc.save();
}

export interface Meta { title?: string; author?: string; subject?: string; keywords?: string; creator?: string; producer?: string }

export async function getMetadata(bytes: Bytes): Promise<Meta> {
  const d = await loadPdf(bytes);
  return {
    title: d.getTitle() ?? '', author: d.getAuthor() ?? '', subject: d.getSubject() ?? '',
    keywords: d.getKeywords() ?? '', creator: d.getCreator() ?? '', producer: d.getProducer() ?? '',
  };
}

export async function setMetadata(bytes: Bytes, m: Meta): Promise<Bytes> {
  const d = await loadPdf(bytes);
  d.setTitle(m.title ?? '');
  d.setAuthor(m.author ?? '');
  d.setSubject(m.subject ?? '');
  d.setKeywords((m.keywords ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  d.setCreator(m.creator ?? '');
  d.setProducer(m.producer ?? '');
  return d.save();
}

export async function protectPdf(bytes: Bytes, userPassword: string, ownerPassword?: string): Promise<Bytes> {
  if (!userPassword) throw new Error('Enter a password');
  const d = await loadPdf(bytes);
  d.encrypt({ userPassword, ownerPassword: ownerPassword || userPassword });
  return d.save();
}

export async function unlockPdf(bytes: Bytes, password: string): Promise<Bytes> {
  let d: PDFDocument;
  try {
    d = await PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch {
    throw new Error('Wrong password or unsupported encryption');
  }
  // re-saving the loaded doc keeps the Encrypt dict, so copy pages into a fresh document
  const out = await PDFDocument.create();
  (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p));
  out.setTitle(d.getTitle() ?? '');
  out.setAuthor(d.getAuthor() ?? '');
  return out.save();
}

export async function isEncrypted(bytes: Bytes): Promise<boolean> {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return d.isEncrypted;
}

export type PageSize = 'fit' | 'a4' | 'letter';
const SIZES: Record<'a4' | 'letter', [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

export async function imagesToPdf(
  images: { bytes: Bytes; type: 'png' | 'jpg' }[],
  o: { pageSize: PageSize; margin: number; landscape?: boolean },
): Promise<Bytes> {
  const doc = await PDFDocument.create();
  for (const im of images) {
    const img = im.type === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    if (o.pageSize === 'fit') {
      const p = doc.addPage([img.width + 2 * o.margin, img.height + 2 * o.margin]);
      p.drawImage(img, { x: o.margin, y: o.margin, width: img.width, height: img.height });
      continue;
    }
    let [w, h] = SIZES[o.pageSize];
    if (o.landscape ?? img.width > img.height) [w, h] = [h, w];
    const s = Math.min((w - 2 * o.margin) / img.width, (h - 2 * o.margin) / img.height);
    const p = doc.addPage([w, h]);
    p.drawImage(img, { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }
  return doc.save();
}

/** Build a PDF from page renders made at `scale` (px per point), keeping original page sizes. */
export async function rasterPdf(jpegs: Bytes[], scale: number): Promise<Bytes> {
  const doc = await PDFDocument.create();
  for (const j of jpegs) {
    const img = await doc.embedJpg(j);
    const w = img.width / scale, h = img.height / scale;
    doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

/**
 * Replace selected pages of a PDF with page images (used by Redact).
 * pdf-lib keeps unreferenced objects when saving, so the removed pages' text, fonts and images would
 * survive in the file. Copying the final pages into a fresh document keeps only what they still use,
 * and also drops document-level outline, metadata, names and form data that can repeat redacted text.
 */
export async function replaceWithRaster(bytes: Bytes, pages: Map<number, Bytes>, scale: number): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  for (const [i, jpg] of pages) {
    const img = await doc.embedJpg(jpg);
    const w = img.width / scale, h = img.height / scale;
    doc.removePage(i);
    doc.insertPage(i, [w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  const clean = await PDFDocument.create();
  (await clean.copyPages(doc, doc.getPageIndices())).forEach((p) => clean.addPage(p));
  return clean.save();
}

/** Plain text to A4 pages with word wrap. Standard fonts only cover WinAnsi; other chars become '?'. */
export async function textToPdf(text: string, fontSize = 11): Promise<Bytes> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [W, H] = SIZES.a4;
  const m = 50;
  const lh = fontSize * 1.4;
  const safe = (s: string) => [...s].map((c) => { try { font.encodeText(c); return c; } catch { return '?'; } }).join('');
  const lines: string[] = [];
  for (const raw of text.replace(/\t/g, '    ').split(/\r?\n/)) {
    let line = '';
    for (const word of safe(raw).split(/(\s+)/)) {
      if (font.widthOfTextAtSize(line + word, fontSize) > W - 2 * m && line) {
        lines.push(line);
        line = word.trimStart();
      } else line += word;
    }
    lines.push(line);
  }
  let page = doc.addPage([W, H]);
  let y = H - m;
  for (const l of lines) {
    if (y < m) { page = doc.addPage([W, H]); y = H - m; }
    page.drawText(l, { x: m, y: y - fontSize, size: fontSize, font });
    y -= lh;
  }
  return doc.save();
}

export async function flattenForms(bytes: Bytes): Promise<Bytes> {
  const d = await loadPdf(bytes);
  d.getForm().flatten();
  return d.save();
}

/** Re-parse and re-save, rebuilding the xref table. Fixes many broken-structure files. */
export async function repairPdf(bytes: Bytes): Promise<Bytes> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export async function pageCount(bytes: Bytes): Promise<number> {
  return (await loadPdf(bytes)).getPageCount();
}
