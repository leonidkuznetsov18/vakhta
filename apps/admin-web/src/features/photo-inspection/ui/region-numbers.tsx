import { useStore } from 'zustand';
import type { InspectionEditor } from '../model/editor';
import { regionAnchor } from '../model/region-navigation';

export function RegionNumbers({ editor }: { editor: InspectionEditor }) {
  const state = useStore(editor.store);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {state.review.annotations.map((annotation, index) => {
        const anchor = regionAnchor(annotation.geometry);
        return (
          <span
            key={annotation.id}
            data-region-number={index + 1}
            className={`absolute flex size-6 origin-top-left items-center justify-center rounded-sm border text-xs font-bold shadow-sm ${state.selected === annotation.id ? 'border-white bg-emerald-600 text-white' : 'border-foreground bg-background text-foreground'}`}
            style={{
              left: `${anchor.x * 100}%`,
              top: `${anchor.y * 100}%`,
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
