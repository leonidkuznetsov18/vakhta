import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectionViewport } from './viewport';
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});
function setup() {
  const viewport = document.body.appendChild(document.createElement('div'));
  const plane = viewport.appendChild(document.createElement('div'));
  let scale = 1;
  let pan = true;
  let ready = true;
  Object.defineProperties(viewport, { clientWidth: { value: 500 }, clientHeight: { value: 300 } });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300));
  vi.spyOn(plane, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(-viewport.scrollLeft, -viewport.scrollTop, 500 * scale, 300 * scale),
  );
  const controller = new InspectionViewport({
    scale: () => scale,
    changeScale: (value) => {
      scale = value;
    },
    canPan: () => pan,
    ready: () => ready,
  });
  const cleanup = controller.attach(plane);
  if (!cleanup) throw new Error('Expected gesture binding');
  cleanups.push(cleanup);
  return {
    viewport,
    plane,
    controller,
    cleanup,
    scale: () => scale,
    canPan: (value: boolean) => {
      pan = value;
    },
    ready: (value: boolean) => {
      ready = value;
    },
  };
}
function pointer(target: Element, type: string, id: number, x: number, y: number, button = 0) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  target.dispatchEvent(event);
  return event;
}
describe('inspection image gestures', () => {
  it('anchors zoom at the cursor and clamps scale without moving the surrounding layout', () => {
    const view = setup();
    view.controller.zoomTo(2, { x: 100, y: 80 });
    expect(view.plane.style.transform).toBe('scale(2)');
    expect([view.viewport.scrollLeft, view.viewport.scrollTop]).toEqual([100, 80]);
    view.controller.zoomTo(3, { x: 100, y: 80 });
    expect([view.viewport.scrollLeft, view.viewport.scrollTop]).toEqual([200, 160]);
    view.controller.zoomTo(99);
    expect(view.scale()).toBe(5);
    view.controller.zoomTo(0);
    expect(view.scale()).toBe(1);
    expect([view.viewport.scrollLeft, view.viewport.scrollTop]).toEqual([0, 0]);
    expect(view.viewport.style.transform).toBe('');
  });
  it('handles wheel and trackpad pinch locally while preserving outside scrolling', () => {
    const view = setup();
    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 80,
    });
    view.plane.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(view.scale()).toBeGreaterThan(1);
    const outside = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    view.ready(false);
    const loading = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    view.viewport.dispatchEvent(loading);
    expect(loading.defaultPrevented).toBe(false);
  });
  it('pans at a fixed scale, captures gestures before annotation handlers, and stops on release', () => {
    const view = setup();
    view.controller.zoomTo(2);
    const annotationDown = vi.fn();
    view.plane.addEventListener('pointerdown', annotationDown);
    pointer(view.plane, 'pointerdown', 1, 200, 150);
    const left = view.viewport.scrollLeft;
    pointer(view.viewport, 'pointermove', 1, 150, 120);
    expect(view.viewport.scrollLeft).toBe(left + 50);
    expect(view.scale()).toBe(2);
    expect(annotationDown).not.toHaveBeenCalled();
    pointer(view.viewport, 'pointerup', 1, 150, 120);
    expect(view.viewport.dataset.panning).toBeUndefined();
    expect(pointer(view.viewport, 'pointermove', 1, 90, 80).defaultPrevented).toBe(false);
  });
  it('preserves drawing with the left button and supports middle-button panning in drawing modes', () => {
    const view = setup();
    view.canPan(false);
    const annotationDown = vi.fn();
    view.plane.addEventListener('pointerdown', annotationDown);
    expect(pointer(view.plane, 'pointerdown', 1, 100, 100).defaultPrevented).toBe(false);
    expect(annotationDown).toHaveBeenCalledOnce();
    expect(pointer(view.plane, 'pointerdown', 2, 100, 100, 1).defaultPrevented).toBe(true);
    expect(annotationDown).toHaveBeenCalledOnce();
  });
  it('pinches around the moving midpoint and resumes one-finger panning after release', () => {
    const view = setup();
    pointer(view.plane, 'pointerdown', 1, 100, 100);
    pointer(view.plane, 'pointerdown', 2, 200, 100);
    pointer(view.viewport, 'pointermove', 2, 300, 100);
    expect(view.scale()).toBe(2);
    expect(view.viewport.scrollLeft).toBe(100);
    pointer(view.viewport, 'pointerup', 2, 300, 100);
    pointer(view.viewport, 'pointermove', 1, 90, 100);
    expect(view.viewport.scrollLeft).toBe(110);
    expect(view.scale()).toBe(2);
  });
  it('cleans up cancelled pointers and removes listeners on unmount', () => {
    const view = setup();
    pointer(view.plane, 'pointerdown', 1, 100, 100);
    pointer(view.viewport, 'pointercancel', 1, 100, 100);
    expect(pointer(view.viewport, 'pointermove', 1, 80, 80).defaultPrevented).toBe(false);
    view.cleanup();
    expect(pointer(view.plane, 'pointerdown', 2, 100, 100).defaultPrevented).toBe(false);
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    view.plane.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(view.scale()).toBe(1);
  });
});
