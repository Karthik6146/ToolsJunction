import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib';
import { fitParagraphs, listSigFields, signPdf, wrapText } from './dsc';

/** PDF with one empty signature field on page 2, like an MCA e-form. */
async function formWithSigField() {
  const d = await PDFDocument.create();
  d.addPage([600, 800]).drawText('page 1', { x: 50, y: 700 });
  const p2 = d.addPage([600, 800]);
  p2.drawText('Signature of Designated Partner', { x: 50, y: 500 });
  const widget = d.context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('DSCSign1'), Rect: [300, 480, 420, 520], F: 4, P: p2.ref });
  const ref = d.context.register(widget);
  p2.node.set(PDFName.of('Annots'), d.context.obj([ref]));
  d.getForm().acroForm.addField(ref);
  return d.save({ useObjectStreams: false });
}

// fake CMS: deterministic bytes so placement can be checked exactly
const fakeSigner = (seen: Uint8Array[]) => async (data: Uint8Array) => { seen.push(data); return new Uint8Array([0x30, 0x82, 0xab, 0xcd]); };

function byteRange(pdf: Uint8Array): number[] {
  const t = new TextDecoder('latin1').decode(pdf);
  const m = [...t.matchAll(/\/ByteRange\s*\[\s*([\d\s]+)\]/g)].at(-1)!;
  return m[1].trim().split(/\s+/).map(Number);
}

describe('signature stamp text', () => {
  const mono = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 };
  it('wraps words and splits over-long ones', () => {
    expect(wrapText(mono, 'KARTHIK SHAKYAWAR', 10, 40)).toEqual(['KARTHIK', 'SHAKYAWA', 'R']);
    expect(wrapText(mono, 'a b c', 10, 100)).toEqual(['a b c']);
  });
  it('shrinks instead of breaking a word', () => {
    const { lines } = fitParagraphs(mono, ['KARTHIK SHAKYAWAR'], 50, 60, 20);
    expect(lines).toEqual(['KARTHIK', 'SHAKYAWAR']);
  });
  it('picks the largest size that fits the box', () => {
    const { size, lines } = fitParagraphs(mono, ['Digitally signed by', 'KARTHIK SHAKYAWAR'], 60, 30, 12);
    expect(lines.length * size * 1.15).toBeLessThanOrEqual(30);
    expect(Math.max(...lines.map((l) => mono.widthOfTextAtSize(l, size)))).toBeLessThanOrEqual(60);
  });
});

describe('DSC signing', () => {
  it('lists signature fields in display coordinates', async () => {
    const f = await listSigFields(await formWithSigField());
    expect(f).toEqual([{ name: 'DSCSign1', page: 1, x: 300, y: 280, w: 120, h: 40, signed: false }]);
  });

  it('signs a field incrementally with a valid byte range', async () => {
    const original = await formWithSigField();
    const seen: Uint8Array[] = [];
    const out = await signPdf(original, { fieldName: 'DSCSign1', signer: 'Test Partner' }, fakeSigner(seen));

    // original bytes untouched: earlier signatures stay valid
    expect(out.subarray(0, original.length)).toEqual(original);
    const [a, b, c, d] = byteRange(out);
    expect(a).toBe(0);
    expect(c + d).toBe(out.length);
    expect(String.fromCharCode(out[b], out[c - 1])).toBe('<>');
    // signer got exactly the two covered ranges
    expect(seen[0].length).toBe(b + d);
    expect(new TextDecoder().decode(out.subarray(b + 1, b + 9))).toBe('3082abcd');

    expect(await listSigFields(out)).toMatchObject([{ name: 'DSCSign1', signed: true }]);
    await expect(signPdf(out, { fieldName: 'DSCSign1', signer: 'x' }, fakeSigner([]))).rejects.toThrow(/already signed/);
  });

  it('signs into a new box drawn anywhere on the page', async () => {
    const out = await signPdf(await formWithSigField(), { box: { page: 0, x: 100, y: 50, w: 180, h: 60 }, signer: 'Very Long Partner Name Here' }, fakeSigner([]));
    const f = (await listSigFields(out)).find((x) => x.page === 0)!;
    expect(f).toMatchObject({ page: 0, x: 100, y: 50, w: 180, h: 60, signed: true });
  });

  it('second signature keeps the first one intact', async () => {
    const once = await signPdf(await formWithSigField(), { fieldName: 'DSCSign1', signer: 'A' }, fakeSigner([]));
    const twice = await signPdf(once, { signer: 'B' }, fakeSigner([]));
    expect(twice.subarray(0, once.length)).toEqual(once);
    expect((await PDFDocument.load(twice)).getPageCount()).toBe(2);
  });
});
