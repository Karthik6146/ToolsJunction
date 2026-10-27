import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Category = 'image' | 'organize' | 'optimize' | 'to-pdf' | 'from-pdf' | 'edit' | 'security' | 'extras';

export interface ToolDef {
  id: string;
  name: string;
  category: Category;
  description: string;
  icon: string;
  component: LazyExoticComponent<ComponentType>;
}

export const CATEGORIES: { id: Category; name: string; color: string }[] = [
  { id: 'image', name: 'Image', color: '#0ea5e9' },
  { id: 'organize', name: 'Organize PDF', color: '#f97316' },
  { id: 'optimize', name: 'Optimize PDF', color: '#22c55e' },
  { id: 'to-pdf', name: 'Convert to PDF', color: '#eab308' },
  { id: 'from-pdf', name: 'Convert from PDF', color: '#3b82f6' },
  { id: 'edit', name: 'Edit & Sign', color: '#a855f7' },
  { id: 'security', name: 'Security', color: '#475569' },
  { id: 'extras', name: 'Extras', color: '#ec4899' },
];

type Load = () => Promise<unknown>;
const pick = (load: Load, name: string) => lazy(() => load().then((m) => ({ default: (m as Record<string, ComponentType>)[name] })));

const img = () => import('./image/ImageTools');
const imgCrop = () => import('./image/Crop');
const imgEdit = () => import('./image/Editor');
const org = () => import('./pdf/Organize');
const opt = () => import('./pdf/Optimize');
const to = () => import('./pdf/ToPdf');
const from = () => import('./pdf/FromPdf');
const mod = () => import('./pdf/Modify');
const ed = () => import('./pdf/Editor');
const sec = () => import('./pdf/Security');
const ext = () => import('./pdf/Extras');

const t = (id: string, name: string, category: Category, icon: string, description: string, load: Load, exp: string): ToolDef =>
  ({ id, name, category, icon, description, component: pick(load, exp) });

export const tools: ToolDef[] = [
  t('resize-image', 'Resize Image', 'image', '⤡', 'Resize by pixels, percentage or target file size. Batch supported.', img, 'ResizeImage'),
  t('compress-image', 'Compress Image', 'image', '◱', 'Shrink JPG, PNG and WEBP files while keeping good quality.', img, 'CompressImage'),
  t('convert-image', 'Convert Image', 'image', '⇄', 'Convert between JPG, PNG and WEBP.', img, 'ConvertImage'),
  t('crop-image', 'Crop Image', 'image', '⌗', 'Crop with a draggable box or exact pixels and aspect ratios.', imgCrop, 'CropImage'),
  t('rotate-image', 'Rotate & Flip Image', 'image', '↻', 'Rotate 90°/180° or flip horizontally and vertically.', img, 'RotateImage'),
  t('image-editor', 'Photo Editor', 'image', '✎', 'Adjust brightness, contrast, filters, add text and draw.', imgEdit, 'ImageEditor'),
  t('image-base64', 'Image to Base64', 'image', '64', 'Encode images as Base64 data URLs.', img, 'ImageBase64'),

  t('merge-pdf', 'Merge PDF', 'organize', '⊕', 'Combine several PDFs into one, in the order you want.', org, 'MergePdf'),
  t('split-pdf', 'Split PDF', 'organize', '⊘', 'Split by page ranges or into single pages.', org, 'SplitPdf'),
  t('remove-pages', 'Remove Pages', 'organize', '✕', 'Delete selected pages from a PDF.', org, 'RemovePages'),
  t('extract-pages', 'Extract Pages', 'organize', '⇱', 'Pull selected pages into a new PDF.', org, 'ExtractPages'),
  t('organize-pdf', 'Organize PDF', 'organize', '☷', 'Reorder, rotate and delete pages visually.', org, 'OrganizePdf'),
  t('rotate-pdf', 'Rotate PDF', 'organize', '↻', 'Rotate all or selected pages.', org, 'RotatePdf'),

  t('compress-pdf', 'Compress PDF', 'optimize', '◱', 'Reduce PDF size for email and upload.', opt, 'CompressPdf'),
  t('repair-pdf', 'Repair PDF', 'optimize', '⚒', 'Rebuild damaged PDF structure.', opt, 'RepairPdf'),
  t('ocr-pdf', 'OCR PDF', 'optimize', 'Aa', 'Make scanned PDFs searchable and selectable.', opt, 'OcrPdf'),

  t('images-to-pdf', 'Images to PDF', 'to-pdf', '▣', 'Turn JPG and PNG images into a PDF.', to, 'ImagesToPdf'),
  t('word-to-pdf', 'Word to PDF', 'to-pdf', 'W', 'Convert DOCX documents to PDF.', to, 'WordToPdf'),
  t('excel-to-pdf', 'Excel to PDF', 'to-pdf', 'X', 'Convert XLSX/CSV spreadsheets to PDF.', to, 'ExcelToPdf'),
  t('html-to-pdf', 'HTML to PDF', 'to-pdf', '</>', 'Convert HTML code or files to PDF.', to, 'HtmlToPdf'),
  t('text-to-pdf', 'Text to PDF', 'to-pdf', 'T', 'Convert plain text into a PDF.', to, 'TextToPdf'),

  t('pdf-to-images', 'PDF to Images', 'from-pdf', '▣', 'Export each page as JPG or PNG.', from, 'PdfToImages'),
  t('pdf-to-word', 'PDF to Word', 'from-pdf', 'W', 'Extract PDF text into an editable DOCX.', from, 'PdfToWord'),
  t('pdf-to-ppt', 'PDF to PowerPoint', 'from-pdf', 'P', 'Turn each page into a PPTX slide.', from, 'PdfToPpt'),
  t('pdf-to-excel', 'PDF to Excel', 'from-pdf', 'X', 'Extract text rows into an XLSX sheet per page.', from, 'PdfToExcel'),
  t('pdf-to-text', 'PDF to Text', 'from-pdf', 'T', 'Extract all text from a PDF.', from, 'PdfToText'),

  t('edit-pdf', 'Edit PDF', 'edit', '✎', 'Add text, images, shapes, drawings, highlights, whiteout and notes.', ed, 'EditPdf'),
  t('sign-pdf', 'Sign PDF', 'edit', '✍', 'Draw, type or upload your signature and place it.', ed, 'SignPdf'),
  t('redact-pdf', 'Redact PDF', 'edit', '█', 'Permanently black out sensitive content.', ed, 'RedactPdf'),
  t('fill-forms', 'Fill PDF Forms', 'edit', '☑', 'Fill in interactive PDF form fields.', mod, 'FillForms'),
  t('watermark-pdf', 'Watermark PDF', 'edit', '≋', 'Stamp text over every page.', mod, 'WatermarkPdf'),
  t('page-numbers', 'Add Page Numbers', 'edit', '#', 'Number pages with your own format and position.', mod, 'PageNumbersPdf'),
  t('crop-pdf', 'Crop PDF', 'edit', '⌗', 'Trim page margins.', mod, 'CropPdf'),
  t('flatten-pdf', 'Flatten PDF', 'edit', '▭', 'Merge form fields into page content.', mod, 'FlattenPdf'),
  t('pdf-metadata', 'Edit Metadata', 'edit', 'ℹ', 'Change title, author, subject and keywords.', mod, 'MetadataPdf'),

  t('protect-pdf', 'Protect PDF', 'security', '🔒︎', 'Encrypt a PDF with a password.', sec, 'ProtectPdf'),
  t('unlock-pdf', 'Unlock PDF', 'security', '🔓︎', 'Remove the password from a PDF you can open.', sec, 'UnlockPdf'),

  t('read-aloud', 'Read PDF Aloud', 'extras', '♪', 'Listen to a PDF with text-to-speech.', ext, 'ReadAloud'),
  t('compare-pdf', 'Compare PDFs', 'extras', '≠', 'Highlight text differences between two PDFs.', ext, 'ComparePdf'),
];

export const toolById = (id: string) => tools.find((x) => x.id === id);
export const catOf = (c: Category) => CATEGORIES.find((x) => x.id === c)!;
