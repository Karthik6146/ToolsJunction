# ToolsJunction — Design Spec

Date: 2026-10-27
Status: approved

## Goal

A free, public, all-in-one tool site (plus Windows desktop app) for image and PDF work,
modelled on reduceimages.com (image resizing/editing), ilovepdf.com (PDF conversion and
organizing) and Adobe Acrobat (PDF editing). All processing happens on the user's device;
files are never uploaded.

Success for v1: every listed tool works end-to-end in the browser on GitHub Pages and in the
Electron desktop build, with a clean, searchable home page.

## Research inputs

- reduceimages.com: resize by pixels / percent / target file size, compress, format convert, crop, rotate, flip.
- ilovepdf.com: merge, split, compress, PDF↔Word/Excel/PPT/JPG, HTML to PDF, edit, sign,
  watermark, rotate, page numbers, organize, protect, unlock, repair, OCR, compare, redact, crop.
- Adobe Acrobat DC install (`C:\Program Files\Adobe\Acrobat DC\Acrobat\plug_ins`): only plugin
  *names* were read as a feature checklist (AcroForm, Annotations, DigSig/PPKLite, TouchUp,
  SaveAsRTF, Search, ReadOutLoud, reflow, Checkers, MakeAccessible). Binaries were not
  decompiled or disassembled: Adobe's EULA forbids it.

## Architecture

- Vite + React + TypeScript single-page app, `HashRouter` so it works on GitHub Pages and from
  Electron `file://`.
- `src/tools/registry.ts` is the single source of truth: each tool has `id`, `name`,
  `category`, `description`, `icon`, and a lazily imported component. Home page renders a
  searchable, category-filtered grid from it. Route: `#/tool/:id`.
- Shared UI: `FileDrop` (drag/drop + picker, accept filter, multiple), `ToolShell` (title,
  description, error display), helpers for download and ZIP.
- Core logic lives in `src/lib/` as plain functions (bytes in, bytes out) so it is unit-testable
  without the UI.
- Libraries: `@cantoo/pdf-lib` (pdf-lib fork with encryption), `pdfjs-dist` (rendering, text
  extraction), `tesseract.js` (OCR), `mammoth` (DOCX → HTML), `xlsx` (Excel), `docx` (write
  DOCX), `pptxgenjs` (write PPTX), `jszip`, `jspdf` + `html2canvas` (HTML → PDF), `diff` (compare).
- Desktop: `electron/main.cjs` loads `dist/index.html`; `electron-builder` produces an NSIS installer.
- CI: GitHub Actions deploys Pages on push to `main`; on tag `v*` builds the Windows installer
  and attaches it to a GitHub Release.

## Tools (v1)

Image: Resize, Compress, Convert, Crop, Rotate/Flip, Image Editor (filters, text, draw), Image to Base64.

Organize PDF: Merge, Split, Remove pages, Extract pages, Organize (reorder/rotate/delete), Rotate.

Optimize PDF: Compress (re-render pages as JPEG at chosen quality), Repair (reload + resave), OCR (searchable text layer).

To PDF: Images to PDF, Word to PDF, Excel to PDF, HTML to PDF, Text to PDF.

From PDF: PDF to Images, PDF to Word (text), PDF to PowerPoint (page images), PDF to Excel (text rows), PDF to Text.

Edit/Sign: PDF Editor (text, image, rectangle, freehand, highlight, whiteout, note), Sign,
Fill Forms, Watermark, Page Numbers, Redact (rasterizes redacted pages so text is truly removed),
Crop PDF, Flatten, Edit Metadata.

Security: Protect (password), Unlock.

Extras: Read Aloud (Web Speech API), Compare PDFs (text diff).

## Out of scope for v1

PowerPoint → PDF, Acrobat-level in-place editing of existing PDF text (editor uses
whiteout + new text instead), certificate-based digital signatures, translation, server-side
processing.

## Error handling

Each tool wraps processing in try/catch and shows the message in `ToolShell`. Wrong passwords,
corrupt files and unsupported types produce readable messages; the page never crashes.

## Testing

Vitest unit tests for `src/lib` functions using PDFs generated in-test. Manual smoke test of each
category in the browser. `npm run build` must pass; Electron build verified in CI.
