import { useCallback, useRef, useState, type ReactNode } from 'react';
import { formatSize } from '../lib/files';

export function FileDrop({ accept, multiple, onFiles, label }: {
  accept: string; multiple?: boolean; onFiles: (f: File[]) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    if (!list?.length) return;
    const exts = accept.split(',').map((s) => s.trim().toLowerCase());
    const ok = [...list].filter((f) =>
      exts.some((e) => (e.startsWith('.') ? f.name.toLowerCase().endsWith(e) : e.endsWith('/*') ? f.type.startsWith(e.slice(0, -1)) : f.type === e)),
    );
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      <svg className="drop-ico" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <div className="drop-btn">{label ?? (multiple ? 'Select files' : 'Select file')}</div>
      <div className="muted">or drop {multiple ? 'files' : 'a file'} here</div>
    </div>
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
