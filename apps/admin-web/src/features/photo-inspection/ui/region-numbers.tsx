import { useStore } from 'zustand';
import type { InspectionEditor } from '../model/editor';

export function RegionNumbers({ editor }: { editor: InspectionEditor }) {
  const state = useStore(editor.store);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {state.review.annotations.map((annotation, index) => {
        return (
          <span
            key={annotation.id}
            ref={(element) => editor.numberPositions.attach(annotation, element)}
            data-region-number={index + 1}
            className={`absolute flex size-6 origin-top-left items-center justify-center rounded-sm border text-xs font-bold shadow-sm ${state.selected === annotation.id ? 'border-white bg-emerald-600 text-white' : 'border-foreground bg-background text-foreground'}`}
            style={{
              transform: `scale(${1 / state.zoom})`,
            }}
          >
            {index + 1}
          </span>
        );
      })}
    </div>
  );
}
