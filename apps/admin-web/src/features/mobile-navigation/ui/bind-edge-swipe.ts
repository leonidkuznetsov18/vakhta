import { createEdgeSwipe } from '../model/edge-swipe';

/** React 19 callback-ref attachment: no overlay and no interception of ordinary taps. */
export function bindEdgeSwipe(node: HTMLElement, open: () => void) {
  const gesture = createEdgeSwipe();
  const point = (touch: Touch, event: TouchEvent) => ({
    id: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
    time: event.timeStamp,
  });
  function start(event: TouchEvent) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return gesture.cancel();
    gesture.start(point(touch, event));
  }
  function move(event: TouchEvent) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return gesture.cancel();
    if (!gesture.move(point(touch, event))) return;
    // Once the browser owns a scroll, do not turn its release into navigation.
    if (!event.cancelable) return gesture.cancel();
    event.preventDefault();
  }
  function finish(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (event.touches.length !== 0 || !touch) return gesture.cancel();
    if (gesture.finish(point(touch, event))) {
      if (event.cancelable) event.preventDefault();
      open();
    }
  }
  const cancel = () => gesture.cancel();
  node.addEventListener('touchstart', start, { capture: true, passive: true });
  // React delegates passive touch events; this listener must claim horizontal movement before scrolling.
  node.addEventListener('touchmove', move, { capture: true, passive: false });
  node.addEventListener('touchend', finish, { capture: true, passive: false });
  node.addEventListener('touchcancel', cancel, { capture: true, passive: true });
  return () => {
    gesture.cancel();
    node.removeEventListener('touchstart', start, true);
    node.removeEventListener('touchmove', move, true);
    node.removeEventListener('touchend', finish, true);
    node.removeEventListener('touchcancel', cancel, true);
  };
}
