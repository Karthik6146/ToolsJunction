# ToolsJunction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Client-side image + PDF tool collection, deployed to GitHub Pages and packaged as an Electron Windows app.

**Architecture:** Vite + React + TS SPA with a tool registry and lazy-loaded tool pages. Pure functions in `src/lib` do the work (bytes in, bytes out); tool components in `src/tools/<category>/` only collect input and call them.

**Tech Stack:** React 18, react-router-dom (HashRouter), @cantoo/pdf-lib, pdfjs-dist, tesseract.js, mammoth, xlsx, docx, pptxgenjs, jszip, jspdf, html2canvas, diff, Vitest, Electron + electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-27-toolsjunction-design.md`

## Global Constraints

- All processing client-side; no network calls with user files.
- `HashRouter`, Vite `base: './'` so the same `dist/` works on Pages (`/ToolsJunction/`) and Electron `file://`.
- Every tool shows errors via `ToolShell` `error` prop; never throws to the page.
- Heavy libs imported only inside tool modules / lib functions (lazy).

## Review Focus

- Encrypted PDF given to a non-unlock tool → readable "PDF is password protected, unlock it first" message. Test in Task 2 (`loadPdf` rejects with that message).
- Page range strings with spaces, reversed or out-of-range numbers ("3-1", "0", "99") → clear error, not silent empty PDF. Test in Task 2 (`parseRanges`).
- Target-KB image resize where target is unreachable → returns smallest achievable result, not infinite loop. Test in Task 3 (`fitToSize` iteration cap).
- Rotations on already-rotated pages → angles accumulate mod 360. Test in Task 2 (`rotatePages`).
- Redaction must remove underlying text, not just cover it. Test in Task 4 (redacted page has no extractable text) — verified manually in browser since it needs canvas.

---

### Task 1: Scaffold app, registry, shared UI

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/tools/registry.ts`, `src/components/FileDrop.tsx`, `src/components/ToolShell.tsx`, `src/lib/files.ts`.

**Interfaces — Produces:**
- `type Category = 'image'|'organize'|'optimize'|'to-pdf'|'from-pdf'|'edit'|'security'|'extras'`
- `interface ToolDef { id: string; name: string; category: Category; description: string; icon: string; component: LazyExoticComponent<ComponentType> }`
- `tools: ToolDef[]` in `registry.ts`
- `<FileDrop accept: string; multiple?: boolean; onFiles(files: File[]): void />`
- `<ToolShell tool: ToolDef; error?: string; busy?: boolean; children />` (looked up by route id)
- `files.ts`: `download(data: Blob|Uint8Array, name: string, type?: string): void`, `zipFiles(items: {name: string; data: Blob|Uint8Array}[]): Promise<Blob>`, `readBytes(f: File): Promise<Uint8Array>`, `baseName(name: string): string`

- [ ] Step 1: `npm create vite` equivalent files by hand; install deps; `npm run build` passes.
- [ ] Step 2: Home page grid with search box + category chips; route `#/tool/:id` renders the lazy component in `Suspense`.
- [ ] Step 3: Commit `feat: scaffold app shell and tool registry`.

### Task 2: PDF core library

**Files:** Create `src/lib/pdf.ts`, `src/lib/pdfjs.ts`; Test `src/lib/pdf.test.ts`.

**Interfaces — Produces (`pdf.ts`):**
- `loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDocument>` — rejects `Error('PDF is password protected, unlock it first')` when encrypted and no password.
- `parseRanges(spec: string, pageCount: number): number[][]` — "1-3, 5" → `[[0,1,2],[4]]`; throws on out-of-range or empty.
- `mergePdfs(files: Uint8Array[]): Promise<Uint8Array>`
- `splitPdf(bytes, ranges: number[][]): Promise<Uint8Array[]>`
- `selectPages(bytes, indices: number[]): Promise<Uint8Array>` (extract / remove / reorder all use this)
- `rotatePages(bytes, indices: number[] | 'all', deg: 90|180|270): Promise<Uint8Array>`
- `watermark(bytes, opts: {text: string; size: number; opacity: number; rotate: number; color: string}): Promise<Uint8Array>`
- `pageNumbers(bytes, opts: {position: 'bottom-center'|'bottom-right'|'top-right'; start: number; format: string /* "{n} / {total}" */}): Promise<Uint8Array>`
- `cropPdf(bytes, margins: {top,right,bottom,left: number} /* points */): Promise<Uint8Array>`
- `setMetadata(bytes, meta: {title?,author?,subject?,keywords?}): Promise<Uint8Array>`, `getMetadata(bytes)`
- `protectPdf(bytes, userPassword: string, ownerPassword?: string): Promise<Uint8Array>`, `unlockPdf(bytes, password: string): Promise<Uint8Array>`
- `imagesToPdf(images: {bytes: Uint8Array; type: 'png'|'jpg'}[], opts: {pageSize: 'fit'|'a4'|'letter'; margin: number}): Promise<Uint8Array>`
- `textToPdf(text: string, fontSize: number): Promise<Uint8Array>`
- `flattenForms(bytes)`, `repairPdf(bytes)`
- `pdfjs.ts`: `openPdfjs(bytes, password?)`, `renderPage(doc, index, scale): Promise<HTMLCanvasElement>`, `extractText(bytes): Promise<string[]>` (per page)

- [ ] Step 1: Tests: merge 2+3 pages → 5; `parseRanges('1-2, 4', 5)` → `[[0,1],[3]]`; `parseRanges('3-1',5)` reversed accepted as `[2,1,0]`; `parseRanges('0',5)` and `'9'` throw; rotate 90 twice → 180; protect then `loadPdf` without password rejects with the message; unlock with password → loads; pageNumbers keeps page count.
- [ ] Step 2: `npx vitest run` fails; implement; passes.
- [ ] Step 3: Commit `feat: pdf core library`.

### Task 3: Image core + image tools

**Files:** Create `src/lib/image.ts` (+ `image.test.ts` for pure math), `src/tools/image/{Resize,Compress,Convert,Crop,RotateFlip,Editor,Base64}.tsx`.

**Interfaces — Produces:**
- `fitDims(w, h, opts: {mode: 'px'|'percent'; width?; height?; percent?; keepRatio: boolean}): {w: number; h: number}`
- `loadImage(f: Blob): Promise<HTMLImageElement>`
- `canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob>`
- `fitToSize(c, type, targetBytes): Promise<Blob>` — binary search quality (max 8 iterations), then downscale by 0.85 up to 6 times; returns smallest found.

- [ ] Step 1: tests for `fitDims` (percent 50 of 800×600 → 400×300; width-only with ratio 400 → 400×300).
- [ ] Step 2: implement; build tools; batch (multiple files) → ZIP download in Resize/Compress/Convert.
- [ ] Step 3: Editor: canvas with sliders (brightness, contrast, saturate, blur, grayscale, sepia, hue) via `ctx.filter`, text overlay, freehand draw, rotate, flip, crop; export PNG/JPG.
- [ ] Step 4: Commit `feat: image tools`.

### Task 4: PDF tools UI

**Files:** `src/tools/pdf/*.tsx` one per tool from spec; `src/components/PageThumbs.tsx` (renders thumbnails via pdfjs, supports select/rotate/delete/reorder by drag).

Tools use Task 2 functions. Notable decisions:
- Compress PDF: render each page at scale from quality preset (low 1.0 / med 1.5 / high 2.0) to JPEG (0.5/0.7/0.85), rebuild with `imagesToPdf`. Show before/after size; if bigger, keep original and say so.
- OCR: `tesseract.js` per rendered page (scale 2), build PDF of page image + invisible text (`opacity: 0`) at word bboxes. Language select: eng default.
- Word→PDF: `mammoth.convertToHtml` → hidden div → `jspdf.html` (html2canvas). Excel→PDF: `xlsx` `sheet_to_html` per sheet → same path. HTML→PDF: textarea/HTML file → same path. Shared helper `htmlToPdf(html: string): Promise<Blob>` in `src/lib/convert.ts`.
- PDF→Word: `extractText` → `docx` paragraphs, page breaks between pages. PDF→Excel: text lines split on 2+ spaces → rows, one sheet per page. PDF→PPT: page images → `pptxgenjs` slides. PDF→Images: PNG/JPG, ZIP if >1 page. PDF→Text.
- Editor/Sign/Redact share `src/components/PdfCanvasEditor.tsx`: renders page with pdfjs, overlay of objects `{type:'text'|'image'|'rect'|'whiteout'|'highlight'|'draw'|'note'|'redact', page, x, y, w, h, ...}` in page points; save applies via pdf-lib (draw* calls; note → text annotation drawn as icon + text). Redact: pages with redactions are rasterized (scale 2) after painting black boxes, so underlying text is gone.
- Fill Forms: list `form.getFields()` with inputs by type; save, optional flatten.
- Compare: `extractText` both → `diffWords` per page, show colored output.
- Read Aloud: `extractText` → `speechSynthesis` with voice/rate, play/pause/stop.

- [ ] Step 1: build tools; register all in `registry.ts`.
- [ ] Step 2: `npm run build` passes; smoke test one tool per category in browser.
- [ ] Step 3: Commit `feat: pdf tools`.

### Task 5: Electron + CI + README

**Files:** `electron/main.cjs`, `package.json` (`main`, `build` config, scripts `electron:dev`, `dist:win`), `.github/workflows/pages.yml`, `.github/workflows/release.yml`, `README.md`, `.gitignore`.

- [ ] Step 1: Electron window loads `dist/index.html`, no node integration, contextIsolation on; external links open in default browser.
- [ ] Step 2: pages.yml: on push main → `npm ci && npm test && npm run build` → `actions/deploy-pages`. release.yml: on tag `v*` windows-latest → `npm run dist:win` → upload `release/*.exe` to Release.
- [ ] Step 3: README with tool list, privacy note, dev/build commands.
- [ ] Step 4: Commit and push `main`.
