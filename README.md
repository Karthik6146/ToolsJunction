# ToolsJunction

Free all-in-one image and PDF toolkit. It runs in your browser and as a Windows desktop app.
**Your files never leave your device:** all processing happens locally in JavaScript.

**Live site:** https://karthik6146.github.io/ToolsJunction/
**Desktop app:** install the site from Chrome/Edge (address bar → *Install app*, no download), or get the Windows installer (~108 MB) from [Releases](https://github.com/Karthik6146/ToolsJunction/releases).

## Tools (39)

| Category | Tools |
|---|---|
| Image | Resize (pixels / % / target KB, batch), Compress, Convert (JPG/PNG/WEBP), Crop, Rotate & Flip, Photo Editor (filters, presets, text, drawing), Image to Base64 |
| Organize PDF | Merge, Split, Remove pages, Extract pages, Organize (drag to reorder, rotate, delete), Rotate |
| Optimize PDF | Compress, Repair, OCR (searchable PDF, 11 languages) |
| Convert to PDF | Images, Word (.docx), Excel (.xlsx/.csv), HTML, Text |
| Convert from PDF | Images (JPG/PNG), Word, PowerPoint, Excel, Text |
| Edit & Sign | Edit PDF (text, images, shapes, freehand, highlight, whiteout, sticky notes), Sign (draw/type/upload), Redact (with text search, true removal), Fill forms, Watermark, Page numbers, Crop, Flatten, Metadata |
| Security | Protect (password), Unlock |
| Extras | Read aloud (text-to-speech), Compare PDFs (text diff) |

Inspired by reduceimages.com, ilovepdf.com and Adobe Acrobat's feature set.

## Limits

- Office conversions are basic fidelity and done in the browser. Word/Excel/HTML to PDF pages are images (text not selectable).
- Compress PDF and Redact turn the affected pages into images.
- Edit PDF adds content on top of pages; it does not change existing PDF text (use whiteout + new text).
- Added text uses standard PDF fonts, which only cover Latin characters.
- OCR downloads its engine and language data from a CDN on first use; the PDF itself stays local.
- Not included: PowerPoint to PDF, certificate-based digital signatures.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run build        # static site in dist/
npm run electron:dev # run the desktop app
npm run dist:win     # build the Windows installer into release/
```

Built for slow connections: the home page loads ~28 KB (gzipped), each tool downloads only the libraries it needs, and a service worker caches everything so repeat visits work offline.

Tech: Preact (React API) + TypeScript + Vite, pdf-lib (@cantoo fork with encryption), pdf.js, tesseract.js, mammoth, SheetJS, docx, pptxgenjs, jsPDF, html2canvas, Electron.

## Deploy

- Push to `main`: GitHub Actions tests, builds and publishes `dist/` to the `gh-pages` branch
  (Pages source: **Settings → Pages → Deploy from a branch → `gh-pages` / root**).
- Push a tag like `v1.0.0`: Actions builds the Windows installer and attaches it to a GitHub Release.

## License

MIT
