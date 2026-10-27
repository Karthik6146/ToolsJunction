import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { applyObjects, type Obj } from './annotate';

describe('applyObjects', () => {
  it('draws objects and normalizes rotated pages', async () => {
    const d = await PDFDocument.create();
    d.addPage([200, 300]);
    d.addPage([200, 300]).setRotation(degrees(90));
    const p3 = d.addPage([200, 300]);
    p3.drawText('x', { x: 10, y: 10 });
    p3.setRotation(degrees(270));
    const objs: Obj[] = [
      { id: 1, page: 0, kind: 'text', x: 10, y: 10, w: 100, h: 20, text: 'Hello\nनमस्ते', size: 12, color: '#000000', font: 'Helvetica' },
      { id: 2, page: 1, kind: 'rect', x: 10, y: 10, w: 50, h: 50, color: '#ff0000' },
      { id: 3, page: 1, kind: 'note', x: 5, y: 5, w: 20, h: 20, text: 'review this', color: '#ffcc00' },
      { id: 4, page: 0, kind: 'draw', x: 0, y: 0, w: 50, h: 50, color: '#0000ff', width: 2, pts: [[0, 0], [10, 10], [20, 5]] },
      { id: 5, page: 2, kind: 'highlight', x: 5, y: 5, w: 20, h: 20, color: '#ffff00' },
    ];
    const out = await PDFDocument.load(await applyObjects(await d.save(), objs));
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(2).getRotation().angle).toBe(0);
    expect(out.getPage(2).getSize()).toEqual({ width: 300, height: 200 });
    const p1 = out.getPage(1);
    expect(p1.getRotation().angle).toBe(0);
    expect(p1.getSize()).toEqual({ width: 300, height: 200 });
    expect(p1.node.Annots()?.size()).toBe(1);
  });
});
