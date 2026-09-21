import { describe, expect, it } from 'vitest';
import { createNavigationGesture } from './gesture';

const start = { id: 1, x: 100, y: 100, time: 0, open: false };
const end = { id: 1, x: 190, y: 105, time: 250 };
describe('mobile navigation gestures', () => {
  it('opens right, closes left and consumes a gesture only once', () => {
    const gesture = createNavigationGesture();
    gesture.start(start);
    expect(gesture.finish(end)).toBe(true);
    expect(gesture.finish(end)).toBeNull();
    gesture.start({ ...start, open: true });
    expect(gesture.finish({ ...end, x: 10 })).toBe(false);
  });
  it('ignores taps, vertical scrolling, long presses and the wrong direction', () => {
    for (const point of [
      { ...end, x: 115 },
      { ...end, y: 180 },
      { ...end, time: 900 },
      { ...end, x: 10 },
    ]) {
      const gesture = createNavigationGesture();
      gesture.start(start);
      expect(gesture.finish(point)).toBeNull();
    }
  });
  it('ignores canceled, secondary and mismatched pointers', () => {
    const gesture = createNavigationGesture();
    gesture.start(start);
    gesture.cancel();
    expect(gesture.finish(end)).toBeNull();
    gesture.start(start);
    gesture.start({ ...start, id: 2 });
    expect(gesture.finish(end)).toBeNull();
    gesture.start(start);
    expect(gesture.finish({ ...end, id: 2 })).toBeNull();
  });
});
