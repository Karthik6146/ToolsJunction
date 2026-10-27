import { useEffect, useState } from 'react';
import { openPdfjs, renderPage } from '../lib/pdfjs';
import type { Bytes } from '../lib/files';

export type PageItem = { index: number; rotate: number };

/** Renders page thumbnails as data URLs. */
export function useThumbs(bytes: Bytes | null, scale = 0.35) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    setThumbs([]);
    setErr('');
    if (!bytes) return;
    let dead = false;
    (async () => {
      const doc = await openPdfjs(bytes);
      for (let i = 0; i < doc.numPages && !dead; i++) {
        const c = await renderPage(doc, i, scale);
        const url = c.toDataURL('image/jpeg', 0.7);
        if (!dead) setThumbs((t) => [...t, url]);
      }
    })().catch((e) => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [bytes, scale]);
  return { thumbs, err };
}

export function PageThumbs({ thumbs, pages, selected, onToggle, onRotate, onDelete, onReorder }: {
  thumbs: string[];
  pages: PageItem[];
  selected?: Set<number>;
  onToggle?: (index: number) => void;
  onRotate?: (pos: number) => void;
  onDelete?: (pos: number) => void;
  onReorder?: (from: number, to: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="thumbs">
      {pages.map((p, pos) => (
        <div
          key={`${p.index}-${pos}`}
          className={`thumb ${selected?.has(p.index) ? 'sel' : ''} ${over === pos ? 'drag-over' : ''}`}
          onClick={() => onToggle?.(p.index)}
          draggable={!!onReorder}
          onDragStart={() => setDragFrom(pos)}
          onDragOver={(e) => { if (onReorder) { e.preventDefault(); setOver(pos); } }}
          onDragLeave={() => setOver(null)}
          onDrop={() => { if (dragFrom !== null && onReorder) onReorder(dragFrom, pos); setDragFrom(null); setOver(null); }}
          role={onToggle ? 'checkbox' : undefined}
          aria-checked={onToggle ? selected?.has(p.index) : undefined}
        >
          {thumbs[p.index]
            ? <img src={thumbs[p.index]} alt={`Page ${p.index + 1}`} style={{ transform: `rotate(${p.rotate}deg)` }} />
            : <div style={{ height: 140, display: 'grid', placeItems: 'center' }}><span className="spin" /></div>}
          <span className="muted">Page {p.index + 1}</span>
          {(onRotate || onDelete) && (
            <div className="tools">
              {onRotate && <button className="icon" aria-label="Rotate page" onClick={(e) => { e.stopPropagation(); onRotate(pos); }}>↻</button>}
              {onDelete && <button className="icon" aria-label="Delete page" onClick={(e) => { e.stopPropagation(); onDelete(pos); }}>✕</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
