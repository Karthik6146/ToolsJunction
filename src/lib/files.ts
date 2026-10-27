export type Bytes = Uint8Array;

export async function readBytes(f: Blob): Promise<Bytes> {
  return new Uint8Array(await f.arrayBuffer());
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function toBlob(data: Blob | Bytes, type = 'application/octet-stream'): Blob {
  return data instanceof Blob ? data : new Blob([data as BlobPart], { type });
}

export function download(data: Blob | Bytes, name: string, type?: string): void {
  const url = URL.createObjectURL(toBlob(data, type));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function zipFiles(items: { name: string; data: Blob | Bytes }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const it of items) {
    let n = it.name;
    for (let i = 2; used.has(n); i++) n = `${i}-${it.name}`;
    used.add(n);
    zip.file(n, it.data);
  }
  return zip.generateAsync({ type: 'blob' });
}

/** Download one file directly, several as a ZIP. */
export async function downloadAll(items: { name: string; data: Blob | Bytes }[], zipName: string, type?: string) {
  if (items.length === 1) download(items[0].data, items[0].name, type);
  else if (items.length > 1) download(await zipFiles(items), zipName);
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const PDF_TYPE = 'application/pdf';
