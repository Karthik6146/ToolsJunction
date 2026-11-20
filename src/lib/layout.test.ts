import { PDFDocument } from '@cantoo/pdf-lib';
import { imagesToPdf, layoutPage, type PageOpts } from './pdf';
import { jpegRotation } from './image';

const A4: PageOpts = { pageSize: 'a4', orientation: 'auto', margin: 20, fill: false };
// 40 x 20 px red PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR4nO3NMQ0AAAACIPuX1hg+bPykycVnFYvFYrFYLO4jHn36HQ4oCLQGAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));

describe('layoutPage', () => {
  it('fits a wide image on a landscape A4 page in auto mode, centred inside the margins', () => {
    const L = layoutPage(400, 200, 0, A4);
    expect(L.pageW).toBeCloseTo(841.89);
    expect(L.box.w).toBeCloseTo(841.89 - 40);
    expect(L.box.y + L.box.h / 2).toBeCloseTo(L.pageH / 2);
  });
  it('a quarter turn makes the same image portrait', () => {
    const L = layoutPage(400, 200, 90, A4);
    expect(L.pageW).toBeCloseTo(595.28);
    expect(L.box.h).toBeGreaterThan(L.box.w);
  });
  it('fill covers the area inside the margins', () => {
    const L = layoutPage(400, 400, 0, { ...A4, fill: true, orientation: 'portrait' });
    expect(L.box.h).toBeCloseTo(L.clip.h);
    expect(L.box.w).toBeGreaterThan(L.clip.w);
  });
  it('image size pages wrap the turned image plus margins', () => {
    expect(layoutPage(400, 200, 270, { ...A4, pageSize: 'fit' })).toMatchObject({ pageW: 240, pageH: 440 });
  });
});

describe('imagesToPdf', () => {
  it('writes one page per image with the turned page shape', async () => {
    const pdf = await imagesToPdf([{ bytes: PNG, type: 'png', rotate: 0 }, { bytes: PNG, type: 'png', rotate: 90 }], { ...A4, fill: true });
    const pages = (await PDFDocument.load(pdf)).getPages().map((p) => p.getSize());
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
    expect(pages[1].width).toBeLessThan(pages[1].height);
  });
});

describe('jpegRotation', () => {
  const exif = (le: boolean, value: number) => {
    const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
    const u32 = (n: number) => (le ? [...u16(n & 0xffff), 0, 0] : [0, 0, ...u16(n & 0xffff)]);
    const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(value), 0, 0, ...u32(0)];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = body.length + 2;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...body, 0xff, 0xda, 0, 2]);
  };
  it('reads the orientation tag in both byte orders', () => {
    expect(jpegRotation(exif(true, 6))).toBe(90);
    expect(jpegRotation(exif(false, 8))).toBe(270);
    expect(jpegRotation(exif(true, 3))).toBe(180);
    expect(jpegRotation(exif(true, 1))).toBe(0);
  });
  it('returns 0 for non-JPEG or truncated data', () => {
    expect(jpegRotation(PNG)).toBe(0);
    expect(jpegRotation(exif(true, 6).slice(0, 12))).toBe(0);
  });
});
