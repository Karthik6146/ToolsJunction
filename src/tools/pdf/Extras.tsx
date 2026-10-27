import { useEffect, useRef, useState } from 'react';
import { FileDrop, Field, Panel, Status, useRunner } from '../../components/ui';
import { readBytes } from '../../lib/files';
import { extractText } from '../../lib/pdfjs';
import { PdfPicker, usePdf } from './common';

export function ReadAloud() {
  const pdf = usePdf();
  const [pages, setPages] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(1);
  const [start, setStart] = useState(1);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [reading, setReading] = useState(-1);
  const supported = typeof speechSynthesis !== 'undefined';
  const stopFlag = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel(); };
  }, [supported]);

  useEffect(() => {
    setPages([]);
    if (pdf.bytes) pdf.run(async () => setPages(await extractText(pdf.bytes!)));
  }, [pdf.bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  const speakPage = (i: number) => {
    if (stopFlag.current || i >= pages.length) { setState('idle'); setReading(-1); return; }
    setReading(i);
    // long utterances get cut off in some browsers, so speak sentence chunks
    const chunks = (pages[i] || ' ').match(/[^.!?\n]+[.!?\n]*/g) ?? [' '];
    chunks.forEach((c, k) => {
      const u = new SpeechSynthesisUtterance(c);
      u.rate = rate;
      const v = voices.find((x) => x.name === voice);
      if (v) u.voice = v;
      if (k === chunks.length - 1) u.onend = () => speakPage(i + 1);
      speechSynthesis.speak(u);
    });
  };

  const play = () => {
    if (state === 'paused') { speechSynthesis.resume(); setState('playing'); return; }
    speechSynthesis.cancel();
    stopFlag.current = false;
    setState('playing');
    speakPage(Math.max(0, Math.min(start - 1, pages.length - 1)));
  };
  const stop = () => { stopFlag.current = true; speechSynthesis.cancel(); setState('idle'); setReading(-1); };

  if (!supported) return <div className="status error">Your browser does not support text-to-speech.</div>;
  return (
    <>
      <PdfPicker pdf={pdf} />
      {pages.length > 0 && <>
        {!pages.some((p) => p.trim()) && <div className="status error">No text found. Run OCR PDF first for scanned documents.</div>}
        <Panel>
          <Field label="Voice">
            <select value={voice} onChange={(e) => setVoice(e.target.value)}>
              <option value="">Default</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </Field>
          <Field label="Speed" value={`${rate}×`}><input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} /></Field>
          <Field label="Start page"><input type="number" min={1} max={pages.length} value={start} onChange={(e) => setStart(+e.target.value)} /></Field>
          {state !== 'playing'
            ? <button className="btn" onClick={play}>▶ {state === 'paused' ? 'Resume' : 'Play'}</button>
            : <button className="btn" onClick={() => { speechSynthesis.pause(); setState('paused'); }}>❚❚ Pause</button>}
          <button className="btn ghost" onClick={stop} disabled={state === 'idle'}>■ Stop</button>
        </Panel>
        {reading >= 0 && <div className="status busy">Reading page {reading + 1} of {pages.length}</div>}
        <textarea readOnly value={pages[Math.max(reading, start - 1)] ?? ''} style={{ marginTop: 16, minHeight: 260 }} />
      </>}
      <Status busy={pdf.busy} error={pdf.error} />
    </>
  );
}

type Part = { value: string; added?: boolean; removed?: boolean };

export function ComparePdf() {
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const { busy, error, run } = useRunner();
  const go = () => run(async () => {
    const [{ diffWords }, ta, tb] = await Promise.all([import('diff'), readBytes(a!).then((x) => extractText(x)), readBytes(b!).then((x) => extractText(x))]);
    setParts(diffWords(ta.join('\n\n'), tb.join('\n\n')));
  });
  const changes = parts?.filter((p) => p.added || p.removed).length ?? 0;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div><b>Original</b>{a ? <div className="result"><span className="fname">{a.name}</span><button className="btn sm ghost" onClick={() => setA(null)}>Change</button></div> : <FileDrop accept=".pdf" onFiles={(f) => setA(f[0])} />}</div>
        <div><b>Changed</b>{b ? <div className="result"><span className="fname">{b.name}</span><button className="btn sm ghost" onClick={() => setB(null)}>Change</button></div> : <FileDrop accept=".pdf" onFiles={(f) => setB(f[0])} />}</div>
      </div>
      <div className="row"><button className="btn" disabled={!a || !b || busy} onClick={go}>Compare</button>
        {parts && <span className="muted">{changes ? `${changes} change(s): ` : 'No text differences found.'} {changes > 0 && <><ins style={{ background: '#bbf7d0' }}>added</ins> / <del style={{ background: '#fecaca' }}>removed</del></>}</span>}
      </div>
      <Status busy={busy} error={error} />
      {parts && <div className="diff" style={{ marginTop: 16 }}>
        {parts.map((p, i) => (p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>))}
      </div>}
    </>
  );
}
