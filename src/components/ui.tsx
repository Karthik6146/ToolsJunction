import { useCallback, useState, type ReactNode } from 'react';
import { acceptsFile, formatSize } from '../lib/files';

export function FileDrop({ accept, multiple, onFiles, label }: {
  accept: string; multiple?: boolean; onFiles: (f: File[]) => void; label?: string;
}) {
  const [over, setOver] = useState(false);
  const [skipped, setSkipped] = useState('');
  const take = (list: FileList | null) => {
    if (!list?.length) return;
    const all = [...list];
    const ok = all.filter((f) => acceptsFile(accept, f));
    const bad = all.filter((f) => !ok.includes(f));
    setSkipped(bad.length ? `Skipped ${bad.map((f) => f.name).join(', ')}: not a supported file` : '');
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };
  // A <label> opens the picker natively. The old box called input.click() on its own click, and the
  // input's click bubbled back to it, so some Android browsers opened the gallery twice or closed it.
  return (
    <label
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <input type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      <svg className="drop-ico" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <div className="drop-btn">{label ?? (multiple ? 'Select files' : 'Select file')}</div>
      <div className="muted">or drop {multiple ? 'files' : 'a file'} here</div>
      {skipped && <div className="status error" role="alert">{skipped}</div>}
    </label>
  );
}

/** Small "add more" tile that sits at the end of a grid of picked files. */
export function AddFiles({ accept, onFiles, label }: { accept: string; onFiles: (f: File[]) => void; label: string }) {
  return (
    <label className="add-tile">
      <input type="file" className="sr-only" accept={accept} multiple onChange={(e) => {
        const ok = [...(e.target.files ?? [])].filter((f) => acceptsFile(accept, f));
        e.target.value = '';
        if (ok.length) onFiles(ok);
      }} />
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <span>{label}</span>
    </label>
  );
}

/** busy/error state + a run() wrapper that turns thrown errors into a message. */
export function useRunner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, []);
  return { busy, error, setError, progress, setProgress, run };
}

export function Status({ busy, error, progress }: { busy: boolean; error: string; progress?: string }) {
  return (
    <>
      {busy && <div className="status busy" role="status"><span className="spin" /> {progress || 'Working…'}</div>}
      {error && <div className="status error" role="alert">{error}</div>}
    </>
  );
}

export function FileList({ files, onRemove, onMove }: {
  files: File[]; onRemove: (i: number) => void; onMove?: (i: number, d: -1 | 1) => void;
}) {
  return (
    <ul className="filelist">
      {files.map((f, i) => (
        <li key={i + f.name}>
          <span className="fname">{f.name}</span>
          <span className="muted">{formatSize(f.size)}</span>
          {onMove && <>
            <button className="icon" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)}>↑</button>
            <button className="icon" aria-label="Move down" disabled={i === files.length - 1} onClick={() => onMove(i, 1)}>↓</button>
          </>}
          <button className="icon" aria-label="Remove" onClick={() => onRemove(i)}>✕</button>
        </li>
      ))}
    </ul>
  );
}

export function useFiles(multiple = true) {
  const [files, setFiles] = useState<File[]>([]);
  return {
    files,
    setFiles,
    add: (f: File[]) => setFiles((cur) => (multiple ? [...cur, ...f] : f.slice(0, 1))),
    remove: (i: number) => setFiles((cur) => cur.filter((_, j) => j !== i)),
    move: (i: number, d: -1 | 1) => setFiles((cur) => {
      const a = [...cur];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      return a;
    }),
  };
}

export function Field({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}{value !== undefined && <b className="field-value">{value}</b>}</span>
      {children}
    </label>
  );
}

/** Pill-style single choice for 2-4 short options. */
export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}
