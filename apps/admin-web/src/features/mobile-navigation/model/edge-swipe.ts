import { createStore } from 'zustand/vanilla';
import { createNavigationGesture } from './gesture';

export const NAVIGATION_EDGE_WIDTH = 60;
interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

/** Claim only an intentional rightward gesture; taps and vertical scrolling remain native. */
export function createEdgeSwipe() {
  const state = createStore<{ start: TouchPoint | null; claimed: boolean }>(() => ({
    start: null,
    claimed: false,
  }));
  const navigation = createNavigationGesture();
  function cancel() {
    state.setState({ start: null, claimed: false });
    navigation.cancel();
  }
  return {
    cancel,
    start(point: TouchPoint) {
      cancel();
      if (point.x < 0 || point.x > NAVIGATION_EDGE_WIDTH) return;
      state.setState({ start: point });
      navigation.start({ ...point, open: false });
    },
    move(point: TouchPoint) {
      const { start, claimed } = state.getState();
      if (!start || point.id !== start.id) return false;
      if (point.time - start.time > 700) {
        cancel();
        return false;
      }
      if (claimed) return true;
      const dx = point.x - start.x;
      const dy = Math.abs(point.y - start.y);
      if (dx < -10 || (dy >= 10 && dy >= Math.abs(dx))) {
        cancel();
        return false;
      }
      if (dx >= 10 && dx > dy * 1.5) {
        state.setState({ claimed: true });
        return true;
      }
      return false;
    },
    finish(point: TouchPoint) {
      const opened = state.getState().claimed && navigation.finish(point) === true;
      cancel();
      return opened;
    },
  };
}
