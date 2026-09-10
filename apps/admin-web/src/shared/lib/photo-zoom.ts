import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import { createStore } from 'zustand/vanilla';

/** Owns the imperative image gesture binding for one mounted photo. */
export function createPhotoZoom() {
  const store = createStore(() => ({ scale: 1 }));
  let api: PanzoomObject | undefined;
  const reset = () => api?.reset({ animate: false });
  return {
    store,
    zoomIn: () => api?.zoomIn({ animate: false }),
    zoomOut: () => api?.zoomOut({ animate: false }),
    reset,
    pan: (x: number, y: number) => {
      if (!api || api.getScale() <= 1) return false;
      api.pan(x / api.getScale(), y / api.getScale(), { relative: true });
      return true;
    },
    attach: (element: HTMLImageElement | null) => {
      if (!element) return;
      const instance = Panzoom(element, {
        minScale: 1,
        maxScale: 5,
        step: 0.25,
        contain: 'outside',
        panOnlyWhenZoomed: true,
        pinchAndPan: true,
        animate: false,
      });
      api = instance;
      const update = () => store.setState({ scale: instance.getScale() });
      const wheel = (event: WheelEvent) => {
        // Preserve the browser's own accessibility zoom shortcuts.
        if (!event.ctrlKey && !event.metaKey) instance.zoomWithWheel(event, { animate: false });
      };
      const doubleClick = () =>
        instance.getScale() > 1 ? reset() : instance.zoom(2, { animate: false });
      element.addEventListener('panzoomchange', update);
      element.addEventListener('wheel', wheel, { passive: false });
      element.addEventListener('dblclick', doubleClick);
      return () => {
        element.removeEventListener('panzoomchange', update);
        element.removeEventListener('wheel', wheel);
        element.removeEventListener('dblclick', doubleClick);
        instance.destroy();
        instance.resetStyle();
        api = undefined;
      };
    },
  };
}
