import type { InspectionAnnotation } from '@vakhta/contracts';
import type { InspectionEditor } from './editor';

/** Anchor numbers to image coordinates, including non-rectangular regions. */
export function regionAnchor(geometry: InspectionAnnotation['geometry']) {
  return geometry.type === 'RECTANGLE'
    ? { x: geometry.x, y: geometry.y }
    : {
        x: Math.min(...geometry.points.map(([x]) => x)),
        y: Math.min(...geometry.points.map(([, y]) => y)),
      };
}

/** Scroll only the region list; keep the photo and the page in place. */
export function attachRegionList(editor: InspectionEditor, list: HTMLDivElement | null) {
  if (!list) return;
  let frame = 0;
  const unsubscribe = editor.store.subscribe((state, previous) => {
    if (state.selected === previous.selected || !state.selected) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const selected = editor.store.getState().selected;
      const card = Array.from(list.children).find(
        (child) => child instanceof HTMLElement && child.dataset.regionId === selected,
      );
      if (!(card instanceof HTMLElement)) return;
      const bounds = list.getBoundingClientRect();
      const target = card.getBoundingClientRect();
      if (target.top < bounds.top || target.bottom > bounds.bottom)
        list.scrollTo({ top: list.scrollTop + target.top - bounds.top, behavior: 'instant' });
    });
  });
  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
  };
}
