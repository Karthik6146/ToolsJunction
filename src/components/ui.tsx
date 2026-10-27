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
      <div className="drop-btn">{label ?? (multiple ? 'Select files' : 'Select file')}</div>
      <div className="muted">or drop {multiple ? 'files' : 'a file'} here · {accept.replace(/,/g, ', ')}</div>
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}
