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

/**
 * Bring the selected card into view. A list that scrolls on its own moves only itself; a list laid
 * out in the page flow (below the photo) asks the nearest scrolling ancestor for the minimum move.
 */
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
      if (list.scrollHeight > list.clientHeight) {
        const bounds = list.getBoundingClientRect();
        const target = card.getBoundingClientRect();
        if (target.top < bounds.top || target.bottom > bounds.bottom)
          list.scrollTo({ top: list.scrollTop + target.top - bounds.top, behavior: 'instant' });
      } else card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  });
  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
  };
}
