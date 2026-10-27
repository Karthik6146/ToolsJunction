import type { Bytes } from './files';

/**
 * Render an HTML string into a paginated A4 PDF.
 * shortcut: rasterizes via html2canvas, so output text is not selectable; a real layout engine would be needed for vector text.
 */
export async function htmlToPdf(html: string, opts: { landscape?: boolean; css?: string } = {}): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pageWpt = opts.landscape ? 841.89 : 595.28;
  const pageHpt = opts.landscape ? 595.28 : 841.89;
  const margin = 36;
  const cssWidth = 800; // layout width in CSS px
  // sandboxed iframe without allow-scripts: untrusted HTML can't run scripts or inline handlers
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${cssWidth}px;height:1000px;border:0`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#000;font:14px/1.5 Arial,Helvetica,sans-serif}
    img{max-width:100%} table{border-collapse:collapse;max-width:100%} td,th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
    h1,h2,h3{line-height:1.2} ${opts.css ?? ''}</style></head><body>${html}</body></html>`;
  const loaded = new Promise((r) => (frame.onload = r));
  document.body.appendChild(frame);
  try {
    await loaded;
    const body = frame.contentDocument!.body;
    frame.style.height = `${body.scrollHeight}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: cssWidth });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: opts.landscape ? 'landscape' : 'portrait' });
    const contentW = pageWpt - 2 * margin;
    const pxPerPt = canvas.width / contentW;
    const sliceHpx = Math.floor((pageHpt - 2 * margin) * pxPerPt);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    for (let y = 0, first = true; y < canvas.height; y += sliceHpx, first = false) {
      const h = Math.min(sliceHpx, canvas.height - y);
      slice.height = h;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, contentW, h / pxPerPt);
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

export async function docxToHtml(bytes: Bytes): Promise<string> {
  const mammoth = await import('mammoth');
  const res = await mammoth.convertToHtml({ arrayBuffer: bytes.slice().buffer as ArrayBuffer });
  return res.value;
}

export async function sheetToHtml(bytes: Bytes): Promise<{ name: string; html: string }[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array' });
  return wb.SheetNames.map((name) => ({ name, html: XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' }) }));
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
export { esc };
