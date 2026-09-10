import { describe, expect, it } from 'vitest';
import { createEdgeSwipe } from './edge-swipe';

const point = { id: 1, x: 30, y: 400, time: 0 };
describe('full-height navigation edge', () => {
  it('opens at the top, middle and bottom, including the 60px boundary', () => {
    for (const x of [0, 30, 60])
      for (const y of [28, 420, 810]) {
        const gesture = createEdgeSwipe();
        gesture.start({ ...point, x, y });
        expect(gesture.move({ ...point, x: x + 20, y, time: 40 })).toBe(true);
        expect(gesture.finish({ ...point, x: x + 140, y, time: 250 })).toBe(true);
        expect(gesture.finish({ ...point, x: x + 140, y, time: 260 })).toBe(false);
      }
  });
  it('does not claim movement starting outside the edge', () => {
    const gesture = createEdgeSwipe();
    gesture.start({ ...point, x: 61 });
    expect(gesture.move({ ...point, x: 160, time: 100 })).toBe(false);
    expect(gesture.finish({ ...point, x: 180, time: 200 })).toBe(false);
  });
  it('preserves taps, vertical scrolling and leftward movement', () => {
    for (const movement of [
      { x: 35, y: 405 },
      { x: 32, y: 420 },
      { x: 15, y: 400 },
    ]) {
      const gesture = createEdgeSwipe();
      gesture.start(point);
      expect(gesture.move({ ...point, ...movement, time: 50 })).toBe(false);
      expect(gesture.finish({ ...point, ...movement, time: 100 })).toBe(false);
    }
  });
  it('never converts a vertical scroll into a horizontal navigation', () => {
    const gesture = createEdgeSwipe();
    gesture.start(point);
    gesture.move({ ...point, y: 425, time: 50 });
    expect(gesture.move({ ...point, x: 180, time: 100 })).toBe(false);
    expect(gesture.finish({ ...point, x: 180, time: 150 })).toBe(false);
  });
  it('leaves a long press to the browser', () => {
    const gesture = createEdgeSwipe();
    gesture.start(point);
    expect(gesture.move({ ...point, x: 100, time: 900 })).toBe(false);
    expect(gesture.finish({ ...point, x: 180, time: 1000 })).toBe(false);
  });
  it('rejects canceled, slow and mismatched releases', () => {
    for (const end of [
      { ...point, id: 2, x: 180, time: 200 },
      { ...point, x: 180, time: 900 },
    ]) {
      const gesture = createEdgeSwipe();
      gesture.start(point);
      gesture.move({ ...point, x: 70, time: 50 });
      expect(gesture.finish(end)).toBe(false);
    }
    const gesture = createEdgeSwipe();
    gesture.start(point);
    gesture.move({ ...point, x: 70, time: 50 });
    gesture.cancel();
    expect(gesture.finish({ ...point, x: 180, time: 200 })).toBe(false);
  });
});
