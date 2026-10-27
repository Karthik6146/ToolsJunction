import type { Bytes } from './files';

const EMBEDDED = /^\s*(data|blob):/i;
const URL_ATTRS = new Set(['src', 'srcset', 'href', 'xlink:href', 'poster', 'background', 'action', 'formaction', 'data', 'cite', 'longdesc', 'lowsrc', 'dynsrc', 'ping', 'manifest', 'codebase', 'archive', 'usemap']);
const DROP = 'script,iframe,frame,frameset,object,embed,applet,link,meta,base,audio,video,source,track,portal,noscript,template';

/** CSS with every external url()/@import removed; null when it uses escapes we can't safely check. */
function inertCss(css: string): string | null {
  // CSS escapes (e.g. `\75 rl(`) can spell url( in ways a pattern can't see: refuse rather than guess
  if (css.includes('\\')) return null;
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)([^)]*?)\1\s*\)/gi, (m, _q, u) => (EMBEDDED.test(u) ? m : 'none'))
    .replace(/image-set\([^)]*\)/gi, (m) => (/url\(|["'](?!\s*(data|blob):)/i.test(m) ? 'none' : m));
}

/**
 * Untrusted HTML (HTML files, Word/Excel conversions) made inert before rendering: no scripts, handlers,
 * frames or embeds, and no URL that would make the app fetch anything. html2canvas loads images through
 * the app page itself, so in the desktop app a `file:///C:/...` or `\\server\share` image would read local
 * files or start a network login; only embedded data:/blob: images are kept.
 */
export function inertHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // parsing loads nothing
  doc.querySelectorAll(DROP).forEach((el) => el.remove());
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      // srcset is a list: "data:… 1x, https://… 2x" starts embedded but still fetches, so always drop it
      if (n.startsWith('on') || n === 'srcset' || (URL_ATTRS.has(n) && !EMBEDDED.test(a.value))) el.removeAttribute(a.name);
      else if (n === 'style') {
        const css = inertCss(a.value);
        if (css === null) el.removeAttribute(a.name); else el.setAttribute(a.name, css);
      }
    }
  }
  doc.querySelectorAll('style').forEach((s) => {
    const css = inertCss(s.textContent ?? '');
    if (css === null) s.remove(); else s.textContent = css;
  });
  return doc.head.innerHTML + doc.body.innerHTML;
}

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
  // sandboxed iframe without allow-scripts: untrusted HTML can't run scripts or inline handlers.
  // inertHtml strips every external reference; the CSP is a second layer for the frame's own loads.
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${cssWidth}px;height:1000px;border:0`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:">
    <style>
    body{margin:0;background:#fff;color:#000;font:14px/1.5 Arial,Helvetica,sans-serif}
    img{max-width:100%} table{border-collapse:collapse;max-width:100%} td,th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
    h1,h2,h3{line-height:1.2} ${opts.css ?? ''}</style></head><body>${inertHtml(html)}</body></html>`;
  const loaded = new Promise((r) => (frame.onload = r));
  document.body.appendChild(frame);
  try {
    await loaded;
    const body = frame.contentDocument!.body;
    frame.style.height = `${body.scrollHeight}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: cssWidth });
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
