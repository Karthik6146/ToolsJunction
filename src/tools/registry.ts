import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Category = 'image' | 'organize' | 'optimize' | 'to-pdf' | 'from-pdf' | 'edit' | 'security' | 'extras';

export interface ToolDef {
  id: string;
  name: string;
  category: Category;
  description: string;
  /** SVG path data on a 24px grid */
  icon: string;
  component: LazyExoticComponent<ComponentType>;
}

// color tints the category's icons and heading dot; it never fills a surface
export const CATEGORIES: { id: Category; name: string; color: string }[] = [
  { id: 'image', name: 'Image', color: '#0ea5e9' },
  { id: 'organize', name: 'Organize PDF', color: '#f97316' },
  { id: 'optimize', name: 'Optimize PDF', color: '#22c55e' },
  { id: 'to-pdf', name: 'Convert to PDF', color: '#eab308' },
  { id: 'from-pdf', name: 'Convert from PDF', color: '#3b82f6' },
  { id: 'edit', name: 'Edit & Sign', color: '#a855f7' },
  { id: 'security', name: 'Security', color: '#14b8a6' },
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

// Icons are SVG path data on a 24px grid, drawn with a 1.5 stroke: a base (a page with a folded
// corner for PDF tools, a frame for image tools) plus a small glyph for what the tool does.
const pg = (glyph: string) => `M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5${glyph}`;
const im = (glyph: string) => `M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z${glyph}`;
const PICTURE = 'M8.5 17.5l2.5-3.5 2 2.5 1-1.2 1.5 2.2z';
const LETTER_W = 'M8.5 12l1.25 5.5L12 13.5l2.25 4 1.25-5.5';
const LETTER_T = 'M9 12h6M12 12v5.5';
const SHEET = 'M8.5 12h7v5.5h-7zM8.5 14.75h7M12 12v5.5';

const t = (id: string, name: string, category: Category, icon: string, description: string, load: Load, exp: string): ToolDef =>
  ({ id, name, category, icon, description, component: pick(load, exp) });

export const tools: ToolDef[] = [
  t('resize-image', 'Resize Image', 'image', im('M9 15l6-6M11.5 9H15v3.5M9 11.5V15h3.5'), 'Resize by pixels, percentage or target file size, in batches', img, 'ResizeImage'),
  t('compress-image', 'Compress Image', 'image', im('M8 16l3-3M8.5 13H11v2.5M16 8l-3 3M13 8.5V11h2.5'), 'Shrink JPG, PNG and WEBP files while keeping good quality', img, 'CompressImage'),
  t('convert-image', 'Convert Image', 'image', im('M8 10h8l-2-2M16 14H8l2 2'), 'Convert between JPG, PNG and WEBP', img, 'ConvertImage'),
  t('crop-image', 'Crop Image', 'image', im('M9.5 7v7.5H17M7 9.5h7.5V17'), 'Crop with a draggable box or exact pixels and aspect ratios', imgCrop, 'CropImage'),
  t('rotate-image', 'Rotate & Flip Image', 'image', im('M15.5 12a3.5 3.5 0 1 1-1.03-2.47M14.5 7.5v2h2'), 'Rotate 90°/180° or flip horizontally and vertically', img, 'RotateImage'),
  t('image-editor', 'Photo Editor', 'image', im('M8 10h8M8 14h8M10.5 8.5v3M13.5 12.5v3'), 'Layered editor with filters, text, shapes, stickers, your own images, drawing and frames', imgEdit, 'ImageEditor'),
  t('image-base64', 'Image to Base64', 'image', im('M10.5 8.5L8 12l2.5 3.5M13.5 8.5L16 12l-2.5 3.5'), 'Encode images as Base64 data URLs', img, 'ImageBase64'),

  t('merge-pdf', 'Merge PDF', 'organize', pg('M12 11.5v6M9 14.5h6'), 'Combine several PDFs into one, in the order you want', org, 'MergePdf'),
  t('split-pdf', 'Split PDF', 'organize', pg('M8 14.5h1.5M11.25 14.5h1.5M14.5 14.5H16'), 'Split by page ranges or into single pages', org, 'SplitPdf'),
  t('remove-pages', 'Remove Pages', 'organize', pg('M9.75 12.25l4.5 4.5M14.25 12.25l-4.5 4.5'), 'Delete selected pages from a PDF', org, 'RemovePages'),
  t('extract-pages', 'Extract Pages', 'organize', pg('M9.5 17l5-5M10.5 12h4v4'), 'Pull selected pages into a new PDF', org, 'ExtractPages'),
  t('organize-pdf', 'Organize PDF', 'organize', pg('M9 12h6M9 14.5h6M9 17h6'), 'Reorder, rotate and delete pages visually', org, 'OrganizePdf'),
  t('rotate-pdf', 'Rotate PDF', 'organize', pg('M15 14.5a3 3 0 1 1-.88-2.12M14.2 10.6v1.8H16'), 'Rotate all or selected pages', org, 'RotatePdf'),

  t('compress-pdf', 'Compress PDF', 'optimize', pg('M12 10.5v3M10.5 12l1.5 1.5 1.5-1.5M12 18.5v-3M10.5 17l1.5-1.5 1.5 1.5'), 'Reduce PDF size for email and upload', opt, 'CompressPdf'),
  t('repair-pdf', 'Repair PDF', 'optimize', pg('M9 14.5l2 2 4-4'), 'Rebuild damaged PDF structure', opt, 'RepairPdf'),
  t('ocr-pdf', 'OCR PDF', 'optimize', pg('M9 12.5v-1h1M15 12.5v-1h-1M9 16.5v1h1M15 16.5v1h-1M9.5 14.5h5'), 'Make scanned PDFs searchable and selectable', opt, 'OcrPdf'),

  t('images-to-pdf', 'Images to PDF', 'to-pdf', pg(PICTURE), 'Turn JPG and PNG images into a PDF', to, 'ImagesToPdf'),
  t('word-to-pdf', 'Word to PDF', 'to-pdf', pg(LETTER_W), 'Convert DOCX documents to PDF', to, 'WordToPdf'),
  t('excel-to-pdf', 'Excel to PDF', 'to-pdf', pg(SHEET), 'Convert XLSX/CSV spreadsheets to PDF', to, 'ExcelToPdf'),
  t('html-to-pdf', 'HTML to PDF', 'to-pdf', pg('M10.5 12.5l-2 2 2 2M13.5 12.5l2 2-2 2'), 'Convert HTML code or files to PDF', to, 'HtmlToPdf'),
  t('text-to-pdf', 'Text to PDF', 'to-pdf', pg(LETTER_T), 'Convert plain text into a PDF', to, 'TextToPdf'),

  t('pdf-to-images', 'PDF to Images', 'from-pdf', pg(PICTURE), 'Export each page as JPG or PNG', from, 'PdfToImages'),
  t('pdf-to-word', 'PDF to Word', 'from-pdf', pg(LETTER_W), 'Extract PDF text into an editable DOCX', from, 'PdfToWord'),
  t('pdf-to-ppt', 'PDF to PowerPoint', 'from-pdf', pg('M10 17.5V12h2.25a1.75 1.75 0 0 1 0 3.5H10'), 'Turn each page into a PPTX slide', from, 'PdfToPpt'),
  t('pdf-to-excel', 'PDF to Excel', 'from-pdf', pg(SHEET), 'Extract text rows into an XLSX sheet per page', from, 'PdfToExcel'),
  t('pdf-to-text', 'PDF to Text', 'from-pdf', pg(LETTER_T), 'Extract all text from a PDF', from, 'PdfToText'),

  t('edit-pdf', 'Edit PDF', 'edit', pg('M9 17.5l.5-2.5 4.5-4.5 2 2-4.5 4.5z'), 'Add text, images, shapes, drawings, highlights, whiteout and notes', ed, 'EditPdf'),
  t('sign-pdf', 'Sign PDF', 'edit', pg('M8.5 15.5c1.2-3 2-3 2.5-1s1.5 1.5 2.2-.3M8.5 18h7'), 'Draw, type or upload your signature and place it', ed, 'SignPdf'),
  t('redact-pdf', 'Redact PDF', 'edit', pg('M8.5 13h7v3h-7zM8.5 14.5h7'), 'Permanently black out sensitive content', ed, 'RedactPdf'),
  t('fill-forms', 'Fill PDF Forms', 'edit', pg('M8.5 12.5H11V15H8.5zM12.5 13.75h3M8.5 17.5h7'), 'Fill in interactive PDF form fields', mod, 'FillForms'),
  t('watermark-pdf', 'Watermark PDF', 'edit', pg('M9 17.5l6-6M9 14.5l3-3M12 17.5l3-3'), 'Stamp text over every page', mod, 'WatermarkPdf'),
  t('page-numbers', 'Add Page Numbers', 'edit', pg('M10.75 11.5l-.75 6M14 11.5l-.75 6M8.75 13.5h6.5M8.5 15.5h6.5'), 'Number pages with your own format and position', mod, 'PageNumbersPdf'),
  t('crop-pdf', 'Crop PDF', 'edit', pg('M10 11v6h6M8 13h6v6'), 'Trim page margins', mod, 'CropPdf'),
  t('flatten-pdf', 'Flatten PDF', 'edit', pg('M12 11v3.5M10.5 13l1.5 1.5 1.5-1.5M9 17h6'), 'Merge form fields into page content', mod, 'FlattenPdf'),
  t('pdf-metadata', 'Edit Metadata', 'edit', pg('M12 14.5v3.5M12 11.75v.01'), 'Change title, author, subject and keywords', mod, 'MetadataPdf'),

  t('protect-pdf', 'Protect PDF', 'security', pg('M9.5 14.5h5V18h-5zM10.5 14.5V13a1.5 1.5 0 0 1 3 0v1.5'), 'Encrypt a PDF with a password', sec, 'ProtectPdf'),
  t('unlock-pdf', 'Unlock PDF', 'security', pg('M9.5 14.5h5V18h-5zM10.5 14.5V13a1.5 1.5 0 0 1 2.9-.5'), 'Remove the password from a PDF you can open', sec, 'UnlockPdf'),

  t('read-aloud', 'Read PDF Aloud', 'extras', pg('M9 13.5h1.5l2-1.5v5l-2-1.5H9zM14.5 13a2.5 2.5 0 0 1 0 3'), 'Listen to a PDF with text-to-speech', ext, 'ReadAloud'),
  t('compare-pdf', 'Compare PDFs', 'extras', pg('M9 13h6M9 16h6M13.5 11.5l-3 6'), 'Highlight text differences between two PDFs', ext, 'ComparePdf'),
];

export const toolById = (id: string) => tools.find((x) => x.id === id);
export const catOf = (c: Category) => CATEGORIES.find((x) => x.id === c)!;
