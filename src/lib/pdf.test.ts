import { PDFDocument } from '@cantoo/pdf-lib';
import {
  loadPdf, parseRanges, mergePdfs, splitPdf, rotatePages, protectPdf, unlockPdf, pageNumbers,
  watermark, selectPages, organizePages, textToPdf, cropPdf, setMetadata, getMetadata,
} from './pdf';

async function make(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([200, 300]).drawText(`p${i + 1}`, { x: 10, y: 10 });
  return d.save();
}
const count = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

describe('parseRanges', () => {
  it('parses lists and ranges', () => expect(parseRanges('1-2, 4', 5)).toEqual([[0, 1], [3]]));
  it('accepts reversed ranges', () => expect(parseRanges('3-1', 5)).toEqual([[2, 1, 0]]));
  it('rejects out of range', () => {
    expect(() => parseRanges('0', 5)).toThrow(/does not exist/);
    expect(() => parseRanges('9', 5)).toThrow(/does not exist/);
  });
  it('rejects garbage and empty', () => {
    expect(() => parseRanges('a-b', 5)).toThrow(/not a valid/);
    expect(() => parseRanges(' , ', 5)).toThrow(/at least one/);
  });
});

describe('pdf ops', () => {
  it('merges', async () => expect(await count(await mergePdfs([await make(2), await make(3)]))).toBe(5));
  it('splits', async () => {
    const parts = await splitPdf(await make(5), [[0, 1], [4]]);
    expect(await Promise.all(parts.map(count))).toEqual([2, 1]);
  });
  it('selects pages', async () => expect(await count(await selectPages(await make(4), [3, 0]))).toBe(2));
  it('rotations accumulate', async () => {
    const r = await rotatePages(await rotatePages(await make(1), 'all', 90), 'all', 270);
    expect((await PDFDocument.load(r)).getPage(0).getRotation().angle).toBe(0);
  });
  it('organizes order + rotation', async () => {
    const r = await organizePages(await make(3), [{ index: 2, rotate: 90 }, { index: 0, rotate: 0 }]);
    const d = await PDFDocument.load(r);
    expect(d.getPageCount()).toBe(2);
    expect(d.getPage(0).getRotation().angle).toBe(90);
  });
  it('protect then unlock', async () => {
    const locked = await protectPdf(await make(2), 'secret');
    await expect(loadPdf(locked)).rejects.toThrow('PDF is password protected, unlock it first');
    await expect(unlockPdf(locked, 'nope')).rejects.toThrow(/Wrong password/);
    expect(await count(await unlockPdf(locked, 'secret'))).toBe(2);
  });
  it('page numbers and watermark keep page count', async () => {
    const b = await make(3);
    expect(await count(await pageNumbers(b, { position: 'bottom-center', start: 1, format: '{n} / {total}', size: 10 }))).toBe(3);
    expect(await count(await watermark(b, { text: 'DRAFT', size: 40, opacity: 0.3, rotate: 45, color: '#ff0000' }))).toBe(3);
  });
  it('text to pdf paginates', async () => expect(await count(await textToPdf('line\n'.repeat(200)))).toBeGreaterThan(1));
  it('crop shrinks page and rejects oversized margins', async () => {
    const c = await cropPdf(await make(1), { top: 10, right: 10, bottom: 10, left: 10 });
    expect((await PDFDocument.load(c)).getPage(0).getCropBox().width).toBe(180);
    await expect(cropPdf(await make(1), { top: 0, right: 150, bottom: 0, left: 150 })).rejects.toThrow(/larger/);
  });
  it('metadata roundtrip', async () => {
    const m = await setMetadata(await make(1), { title: 'T', author: 'A', keywords: 'x, y' });
    expect(await getMetadata(m)).toMatchObject({ title: 'T', author: 'A' });
  });
});
