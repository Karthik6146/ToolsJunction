import { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, LineCapStyle, degrees, rgb, type PDFPage, type PDFFont } from '@cantoo/pdf-lib';
import { hexToRgb, loadPdf } from './pdf';
import type { Bytes } from './files';

/** Overlay object in display coordinates: PDF points, origin top-left of the page as shown (rotation applied). */
export type Obj =
  | { id: number; page: number; kind: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; color: string; font: FontName }
  | { id: number; page: number; kind: 'image'; x: number; y: number; w: number; h: number; src: string }
  | { id: number; page: number; kind: 'rect' | 'whiteout' | 'highlight' | 'redact'; x: number; y: number; w: number; h: number; color: string }
  | { id: number; page: number; kind: 'draw'; x: number; y: number; w: number; h: number; color: string; width: number; pts: [number, number][] }
  | { id: number; page: number; kind: 'note'; x: number; y: number; w: number; h: number; text: string; color: string };

export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Courier';
const FONTS: Record<FontName, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  'Helvetica-Bold': StandardFonts.HelveticaBold,
  'Times-Roman': StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

/**
 * Re-create rotated pages as unrotated pages that look the same, so display
 * coordinates map to PDF coordinates with a simple y-flip.
 */
async function normalizeRotation(doc: PDFDocument, indices: Set<number>) {
  for (const i of [...indices].sort((a, b) => a - b)) {
    const page = doc.getPage(i);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    if (!rot) continue;
    const box = page.getCropBox();
    const { width: w, height: h } = box;
    const swap = rot === 90 || rot === 270;
    // a blank page has no Contents stream and can't be embedded; the new blank page is equivalent
    const emb = page.node.Contents()
      ? await doc.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height })
      : null;
    const np = doc.insertPage(i, swap ? [h, w] : [w, h]);
    const at = { 90: { x: 0, y: w }, 180: { x: w, y: h }, 270: { x: h, y: 0 } }[rot as 90 | 180 | 270];
    if (emb) np.drawPage(emb, { ...at, rotate: degrees(-rot) });
    doc.removePage(i + 1);
  }
}

const safeText = (font: PDFFont, s: string) =>
  [...s].map((c) => { if (c === '\n') return c; try { font.encodeText(c); return c; } catch { return '?'; } }).join('');

function addNote(doc: PDFDocument, page: PDFPage, x: number, y: number, text: string, color: string) {
  const c = hexToRgb(color);
  const annot = doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [x, y - 20, x + 20, y], Name: 'Comment', Open: false,
    Contents: PDFHexString.fromText(text), T: PDFString.of('ToolsJunction'), C: [c.red, c.green, c.blue], F: 4,
  });
  const ref = doc.context.register(annot);
  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

async function embedDataUrl(doc: PDFDocument, src: string) {
  const bytes = Uint8Array.from(atob(src.split(',')[1]), (c) => c.charCodeAt(0));
  return src.startsWith('data:image/png') ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

/** Draw overlay objects into the PDF. Redact boxes are drawn black here; rasterizing is done by the caller. */
export async function applyObjects(bytes: Bytes, objs: Obj[]): Promise<Bytes> {
  const doc = await loadPdf(bytes);
  await normalizeRotation(doc, new Set(objs.map((o) => o.page)));
  const fonts = new Map<FontName, PDFFont>();
  const font = async (n: FontName) => fonts.get(n) ?? fonts.set(n, await doc.embedFont(FONTS[n])).get(n)!;

  for (const o of objs) {
    const page = doc.getPage(o.page);
    const box = page.getCropBox();
    // display (top-left origin) -> PDF user space
    const X = (x: number) => box.x + x;
    const Y = (y: number) => box.y + box.height - y;
    switch (o.kind) {
      case 'text': {
        const f = await font(o.font);
        page.drawText(safeText(f, o.text), { x: X(o.x), y: Y(o.y) - o.size, size: o.size, font: f, color: hexToRgb(o.color), lineHeight: o.size * 1.2 });
        break;
      }
      case 'image': {
        const img = await embedDataUrl(doc, o.src);
        page.drawImage(img, { x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h });
        break;
      }
      case 'rect':
        page.drawRectangle({ x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, borderColor: hexToRgb(o.color), borderWidth: 2 });
        break;
      case 'whiteout':
        page.drawRectangle({ x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, color: rgb(1, 1, 1) });
        break;
      case 'highlight':
        page.drawRectangle({ x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, color: hexToRgb(o.color), opacity: 0.35 });
        break;
      case 'redact':
        page.drawRectangle({ x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, color: rgb(0, 0, 0) });
        break;
      case 'draw': {
        const c = hexToRgb(o.color);
        for (let i = 1; i < o.pts.length; i++) {
          const [ax, ay] = o.pts[i - 1], [bx, by] = o.pts[i];
          page.drawLine({ start: { x: X(o.x + ax), y: Y(o.y + ay) }, end: { x: X(o.x + bx), y: Y(o.y + by) }, thickness: o.width, color: c, lineCap: LineCapStyle.Round });
        }
        break;
      }
      case 'note':
        addNote(doc, page, X(o.x), Y(o.y), o.text, o.color);
        break;
    }
  }
  return doc.save();
}
