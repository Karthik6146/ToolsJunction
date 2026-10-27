import { useEffect, useState } from 'react';
import { Field, Panel, Status } from '../../components/ui';
import { PDF_TYPE, download } from '../../lib/files';
import { cropPdf, flattenForms, getMetadata, loadPdf, pageNumbers, setMetadata, watermark, type Meta, type NumberPosition } from '../../lib/pdf';
import { PdfPicker, outName, usePdf } from './common';
import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from '@cantoo/pdf-lib';

export function WatermarkPdf() {
  const pdf = usePdf();
  const [o, setO] = useState({ text: 'CONFIDENTIAL', size: 60, opacity: 0.25, rotate: 45, color: '#e5322d' });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Text"><input value={o.text} onChange={(e) => setO({ ...o, text: e.target.value })} /></Field>
        <Field label="Font size"><input type="number" min={8} max={200} value={o.size} onChange={(e) => setO({ ...o, size: +e.target.value })} /></Field>
        <Field label={`Opacity: ${Math.round(o.opacity * 100)}%`}><input type="range" min={5} max={100} value={o.opacity * 100} onChange={(e) => setO({ ...o, opacity: +e.target.value / 100 })} /></Field>
        <Field label="Angle"><select value={o.rotate} onChange={(e) => setO({ ...o, rotate: +e.target.value })}><option value={0}>0°</option><option value={45}>45°</option><option value={90}>90°</option><option value={-45}>-45°</option></select></Field>
        <Field label="Color"><input type="color" value={o.color} onChange={(e) => setO({ ...o, color: e.target.value })} /></Field>
        <button className="btn" disabled={pdf.busy || !o.text.trim()} onClick={() => pdf.run(async () => download(await watermark(pdf.bytes!, o), outName(pdf.file, 'watermarked'), PDF_TYPE))}>Add watermark</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function PageNumbersPdf() {
  const pdf = usePdf();
  const [o, setO] = useState<{ position: NumberPosition; start: number; format: string; size: number }>({ position: 'bottom-center', start: 1, format: '{n} / {total}', size: 11 });
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Position">
          <select value={o.position} onChange={(e) => setO({ ...o, position: e.target.value as NumberPosition })}>
            {['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right'].map((p) => <option key={p} value={p}>{p.replace('-', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Format ({n}, {total})"><input value={o.format} onChange={(e) => setO({ ...o, format: e.target.value })} /></Field>
        <Field label="Start at"><input type="number" value={o.start} onChange={(e) => setO({ ...o, start: +e.target.value })} /></Field>
        <Field label="Font size"><input type="number" min={6} max={48} value={o.size} onChange={(e) => setO({ ...o, size: +e.target.value })} /></Field>
        <button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => download(await pageNumbers(pdf.bytes!, o), outName(pdf.file, 'numbered'), PDF_TYPE))}>Add page numbers</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function CropPdf() {
  const pdf = usePdf();
  const [m, setM] = useState({ top: 36, right: 36, bottom: 36, left: 36 });
  const [unit, setUnit] = useState<'pt' | 'mm'>('mm');
  const k = unit === 'mm' ? 72 / 25.4 : 1;
  const side = (s: keyof typeof m) => (
    <Field label={`${s[0].toUpperCase() + s.slice(1)} (${unit})`}>
      <input type="number" min={0} value={Math.round((m[s] / k) * 10) / 10} onChange={(e) => setM({ ...m, [s]: +e.target.value * k })} />
    </Field>
  );
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        <Field label="Unit"><select value={unit} onChange={(e) => setUnit(e.target.value as 'pt')}><option value="mm">mm</option><option value="pt">points</option></select></Field>
        {side('top')}{side('right')}{side('bottom')}{side('left')}
        <button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => download(await cropPdf(pdf.bytes!, m), outName(pdf.file, 'cropped'), PDF_TYPE))}>Crop PDF</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function FlattenPdf() {
  const pdf = usePdf();
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <div className="row"><button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => download(await flattenForms(pdf.bytes!), outName(pdf.file, 'flattened'), PDF_TYPE))}>Flatten forms</button></div>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

export function MetadataPdf() {
  const pdf = usePdf();
  const [meta, setMeta] = useState<Meta>({});
  useEffect(() => { if (pdf.bytes) getMetadata(pdf.bytes).then(setMeta).catch(() => {}); }, [pdf.bytes]);
  const keys: (keyof Meta)[] = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && <Panel>
        {keys.map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input value={meta[k] ?? ''} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></Field>)}
        <button className="btn" disabled={pdf.busy} onClick={() => pdf.run(async () => download(await setMetadata(pdf.bytes!, meta), outName(pdf.file, 'meta'), PDF_TYPE))}>Save metadata</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

type FieldInfo = { name: string; kind: 'text' | 'check' | 'select' | 'radio' | 'other'; options: string[]; value: string | boolean };

export function FillForms() {
  const pdf = usePdf();
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [flatten, setFlatten] = useState(false);
  useEffect(() => {
    setFields([]);
    if (!pdf.bytes) return;
    pdf.run(async () => {
      const form = (await loadPdf(pdf.bytes!)).getForm();
      setFields(form.getFields().map((f): FieldInfo => {
        const name = f.getName();
        if (f instanceof PDFTextField) return { name, kind: 'text', options: [], value: f.getText() ?? '' };
        if (f instanceof PDFCheckBox) return { name, kind: 'check', options: [], value: f.isChecked() };
        if (f instanceof PDFDropdown || f instanceof PDFOptionList) return { name, kind: 'select', options: f.getOptions(), value: f.getSelected()[0] ?? '' };
        if (f instanceof PDFRadioGroup) return { name, kind: 'radio', options: f.getOptions(), value: f.getSelected() ?? '' };
        return { name, kind: 'other', options: [], value: '' };
      }));
    });
  }, [pdf.bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => pdf.run(async () => {
    const doc = await loadPdf(pdf.bytes!);
    const form = doc.getForm();
    for (const f of fields) {
      if (f.kind === 'text') form.getTextField(f.name).setText(String(f.value));
      if (f.kind === 'check') f.value ? form.getCheckBox(f.name).check() : form.getCheckBox(f.name).uncheck();
      if (f.kind === 'select' && f.value) {
        const field = form.getField(f.name);
        if (field instanceof PDFDropdown || field instanceof PDFOptionList) field.select(String(f.value));
      }
      if (f.kind === 'radio' && f.value) form.getRadioGroup(f.name).select(String(f.value));
    }
    if (flatten) form.flatten();
    download(await doc.save(), outName(pdf.file, 'filled'), PDF_TYPE);
  });

  const set = (i: number, value: string | boolean) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, value } : f)));
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pdf.bytes && !pdf.busy && !fields.length && !pdf.error && <p className="muted">This PDF has no fillable form fields. Use Edit PDF to type on it instead.</p>}
      {fields.length > 0 && <Panel>
        {fields.map((f, i) => (
          <Field key={f.name} label={f.name}>
            {f.kind === 'text' && <input value={String(f.value)} onChange={(e) => set(i, e.target.value)} />}
            {f.kind === 'check' && <input type="checkbox" checked={!!f.value} onChange={(e) => set(i, e.target.checked)} />}
            {(f.kind === 'select' || f.kind === 'radio') && <select value={String(f.value)} onChange={(e) => set(i, e.target.value)}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>}
            {f.kind === 'other' && <span className="muted">Unsupported field type</span>}
          </Field>
        ))}
        <label className="field check"><input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />Flatten after filling</label>
        <button className="btn" disabled={pdf.busy} onClick={save}>Save filled PDF</button>
      </Panel>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}
