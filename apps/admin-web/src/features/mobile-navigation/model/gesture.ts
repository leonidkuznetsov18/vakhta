import { createStore } from 'zustand/vanilla';

interface Point {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}
interface Start extends Point {
  readonly open: boolean;
}

/** Gesture state is isolated per mounted shell; scrolling and canceled pointers never navigate. */
export function createNavigationGesture() {
  const state = createStore<{ start: Start | null }>(() => ({ start: null }));
  return {
    start(point: Start) {
      // A second finger cancels the gesture instead of stealing pinch-to-zoom.
      state.setState({ start: state.getState().start ? null : point });
    },
    cancel() {
      state.setState({ start: null });
    },
    finish(point: Point): boolean | null {
      const start = state.getState().start;
      state.setState({ start: null });
      if (!start || point.id !== start.id || point.time - start.time > 700) return null;
      const dx = point.x - start.x;
      const dy = Math.abs(point.y - start.y);
      if (Math.abs(dx) < 64 || dy > 40 || Math.abs(dx) < dy * 2) return null;
      if (start.open && dx < 0) return false;
      if (!start.open && dx > 0) return true;
      return null;
    },
  };
}
