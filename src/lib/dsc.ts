import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFSignature, PDFString, StandardFonts, type PDFRef } from '@cantoo/pdf-lib';
import type { Bytes } from './files';

/** Signature field as shown on screen: display coords in points, origin top-left of the page. */
export interface SigField { name: string; page: number; x: number; y: number; w: number; h: number; signed: boolean }

const SIG_HEX_LEN = 32768; // room for a 16 KB CMS blob: signature + full certificate chain
const BR_PLACEHOLDER = 9999999999; // 10 digits: wide enough for any real offset

export async function listSigFields(bytes: Bytes): Promise<SigField[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  const out: SigField[] = [];
  for (const f of doc.getForm().getFields()) {
    if (!(f instanceof PDFSignature)) continue;
    const signed = !!f.acroField.dict.get(PDFName.of('V'));
    for (const w of f.acroField.getWidgets()) {
      const ref = doc.context.getObjectRef(w.dict);
      const pRef = w.P();
      let page = pages.findIndex((p) => p.ref === pRef);
      if (page < 0 && ref) page = pages.findIndex((p) => (p.node.Annots()?.indexOf(ref) ?? -1) >= 0);
      if (page < 0) page = 0;
      const r = w.getRectangle();
      const box = pages[page].getCropBox();
      // shortcut: assumes unrotated pages (true for MCA / government e-forms); rotated pages would need a coordinate transform
      out.push({ name: f.getName(), page, x: r.x - box.x, y: box.y + box.height - (r.y + r.height), w: r.width, h: r.height, signed });
    }
  }
  return out;
}

const pdfDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`;
};

/** Visible "Digitally signed by" stamp for the widget. */
async function appearance(doc: PDFDocument, w: number, h: number, signer: string, when: Date): Promise<PDFRef> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [`Digitally signed by ${signer}`, `Date: ${when.toLocaleString()}`];
  const size = Math.max(4, Math.min(9, h / 3.2, (w - 4) / (Math.max(...lines.map((l) => l.length)) * 0.5)));
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
  const ops = `0.2 0.4 0.15 rg BT /F1 ${size.toFixed(2)} Tf 2 ${(h - size - 2).toFixed(2)} Td ${size * 1.25} TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const stream = doc.context.stream(ops, {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h],
    Resources: { Font: { F1: font.ref } },
  });
  return doc.context.register(stream);
}

/**
 * Sign a PDF as an incremental update, so earlier signatures and form data stay valid.
 * `sign` receives the exact bytes covered by /ByteRange and must return a detached CMS (PKCS#7) in DER.
 * Without `fieldName` an invisible signature is added on page 1.
 */
export async function signPdf(
  bytes: Bytes,
  o: { fieldName?: string; signer: string; reason?: string; location?: string },
  sign: (data: Bytes) => Promise<Bytes>,
): Promise<Bytes> {
  const doc = await PDFDocument.load(bytes, { forIncrementalUpdate: true, updateMetadata: false });
  const ctx = doc.context;
  const now = new Date();

  const sig = ctx.obj({
    Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, BR_PLACEHOLDER, BR_PLACEHOLDER, BR_PLACEHOLDER],
    Contents: PDFHexString.of('0'.repeat(SIG_HEX_LEN)),
    M: PDFString.of(pdfDate(now)),
    Name: PDFHexString.fromText(o.signer),
    ...(o.reason ? { Reason: PDFHexString.fromText(o.reason) } : {}),
    ...(o.location ? { Location: PDFHexString.fromText(o.location) } : {}),
  });
  const sigRef = ctx.register(sig);

  const form = doc.getForm();
  if (o.fieldName) {
    const field = form.getField(o.fieldName);
    if (!(field instanceof PDFSignature)) throw new Error(`"${o.fieldName}" is not a signature field`);
    if (field.acroField.dict.get(PDFName.of('V'))) throw new Error('This signature field is already signed');
    field.acroField.dict.set(PDFName.of('V'), sigRef);
    for (const w of field.acroField.getWidgets()) {
      const r = w.getRectangle();
      if (r.width > 1 && r.height > 1) w.setNormalAppearance(await appearance(doc, r.width, r.height, o.signer, now));
    }
  } else {
    const page = doc.getPage(0);
    const widget = ctx.obj({
      Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], F: 132,
      T: PDFHexString.fromText(`Signature${Date.now()}`), V: sigRef, P: page.ref,
    });
    const wRef = ctx.register(widget);
    const annots = page.node.Annots();
    if (annots) annots.push(wRef);
    else page.node.set(PDFName.of('Annots'), ctx.obj([wRef]));
    form.acroForm.addField(wRef);
  }
  // SigFlags 3: SignaturesExist | AppendOnly, tells viewers to keep incremental updates
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));

  // object streams would compress the placeholder; it must stay as raw text in the file
  const out = await doc.commit({ useObjectStreams: false });

  const txt = new TextDecoder('latin1').decode(out);
  const hexStart = txt.lastIndexOf('<' + '0'.repeat(SIG_HEX_LEN) + '>');
  if (hexStart < bytes.length) throw new Error('Could not place the signature in the PDF');
  const hexEnd = hexStart + SIG_HEX_LEN + 2;
  const brText = `[ 0 ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ]`;
  const brAt = txt.lastIndexOf(brText);
  if (brAt < bytes.length) throw new Error('Could not place the signature byte range');

  const range = [0, hexStart, hexEnd, out.length - hexEnd];
  const brFinal = `[ ${range.join(' ')} ]`.padEnd(brText.length, ' ');
  out.set(new TextEncoder().encode(brFinal), brAt);

  const signed = new Uint8Array(range[1] + range[3]);
  signed.set(out.subarray(0, range[1]));
  signed.set(out.subarray(range[2]), range[1]);
  const cms = await sign(signed);

  const hex = Array.from(cms, (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length > SIG_HEX_LEN) throw new Error('Signature is too large for the reserved space');
  out.set(new TextEncoder().encode(hex.padEnd(SIG_HEX_LEN, '0')), hexStart + 1);
  return out;
}

/** Desktop-only bridge exposed by electron/preload.cjs. */
export interface DscCert { thumbprint: string; name: string; issuer: string; expires: string }
export interface DscBridge { list(): Promise<DscCert[]>; sign(thumbprint: string, data: Bytes): Promise<Bytes> }
export const dscBridge = (): DscBridge | undefined => (window as unknown as { dsc?: DscBridge }).dsc;
