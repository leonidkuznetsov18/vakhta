import { useStore } from 'zustand';
import type { InspectionEditor } from '../model/editor';
import { objectColor, SELECTED_COLOR, UNNAMED_COLOR } from '../model/object-colors';

export function RegionNumbers({ editor }: { editor: InspectionEditor }) {
  const state = useStore(editor.store);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {state.review.annotations.map((annotation, index) => {
        const selected = state.selected === annotation.id;
        const color = selected
          ? SELECTED_COLOR
          : objectColor(annotation.objectId, annotation.objectName);
        return (
          <span
            key={annotation.id}
            ref={(element) => editor.numberPositions.attach(annotation, element)}
            data-region-number={index + 1}
            className="absolute flex size-6 origin-top-left items-center justify-center rounded-sm border border-black/40 text-xs font-bold shadow-sm"
            style={{
              transform: `scale(${1 / state.zoom})`,
              backgroundColor: color,
              color: color === UNNAMED_COLOR ? '#000000' : '#ffffff',
            }}
          >
            {index + 1}
          </span>
        );
      })}
    </div>
  );
}
