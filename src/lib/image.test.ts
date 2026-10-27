import { fitDims } from './image';

describe('fitDims', () => {
  it('percent', () => expect(fitDims(800, 600, { mode: 'percent', percent: 50, keepRatio: true })).toEqual({ w: 400, h: 300 }));
  it('width only keeps ratio', () => expect(fitDims(800, 600, { mode: 'px', width: 400, keepRatio: true })).toEqual({ w: 400, h: 300 }));
  it('both with ratio fits inside box', () => expect(fitDims(800, 600, { mode: 'px', width: 400, height: 400, keepRatio: true })).toEqual({ w: 400, h: 300 }));
  it('both without ratio stretches', () => expect(fitDims(800, 600, { mode: 'px', width: 100, height: 100, keepRatio: false })).toEqual({ w: 100, h: 100 }));
  it('never zero', () => expect(fitDims(10, 10, { mode: 'percent', percent: 1, keepRatio: true })).toEqual({ w: 1, h: 1 }));
});
