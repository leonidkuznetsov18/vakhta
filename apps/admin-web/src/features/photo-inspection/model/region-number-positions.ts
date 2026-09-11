import {
  ShapeType,
  type ImageAnnotation,
  type ImageAnnotator,
  type StoreChangeEvent,
} from '@annotorious/annotorious';
import { z } from 'zod';
import type { InspectionAnnotation } from '@vakhta/contracts';
import { regionAnchor } from './region-navigation';

type CanvasStore = Pick<
  ImageAnnotator['state']['store'],
  'observe' | 'unobserve' | 'getAnnotation'
>;

const Rectangle = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rot: z.number().default(0),
});
const Polygon = z.object({ points: z.array(z.tuple([z.number(), z.number()])).min(3) });

function liveAnchor(annotation: ImageAnnotation) {
  const shape = annotation.target.selector;
  // Annotorious 3.8.10 rectangle bounds can describe the previous drag frame.
  // Derive the anchor from the coordinates used to render the current shape.
  if (shape.type === ShapeType.RECTANGLE) {
    const { x, y, w, h, rot } = Rectangle.parse(shape.geometry);
    const halfWidth = (Math.abs(w * Math.cos(rot)) + Math.abs(h * Math.sin(rot))) / 2;
    const halfHeight = (Math.abs(w * Math.sin(rot)) + Math.abs(h * Math.cos(rot))) / 2;
    return { x: x + w / 2 - halfWidth, y: y + h / 2 - halfHeight };
  }
  const { points } = Polygon.parse(shape.geometry);
  return { x: Math.min(...points.map(([x]) => x)), y: Math.min(...points.map(([, y]) => y)) };
}

/** Positions badges from the same live store as the SVG, before the browser paints a drag frame. */
export class RegionNumberPositions {
  private readonly elements = new Map<string, HTMLSpanElement>();
  private source: { store: CanvasStore; width: number; height: number } | null = null;

  attach(annotation: InspectionAnnotation, element: HTMLSpanElement | null) {
    if (!element) return;
    this.elements.set(annotation.id, element);
    const live = this.source?.store.getAnnotation(annotation.id);
    if (live) this.position(live);
    else {
      const anchor = regionAnchor(annotation.geometry);
      element.style.left = `${anchor.x * 100}%`;
      element.style.top = `${anchor.y * 100}%`;
    }
    return () => {
      if (this.elements.get(annotation.id) === element) this.elements.delete(annotation.id);
    };
  }

  connect(store: CanvasStore, width: number, height: number) {
    this.source = { store, width, height };
    const update = (event: StoreChangeEvent<ImageAnnotation>) => {
      for (const annotation of event.changes.created ?? []) this.position(annotation);
      for (const change of event.changes.updated ?? []) this.position(change.newValue);
    };
    store.observe(update);
    for (const id of this.elements.keys()) {
      const annotation = store.getAnnotation(id);
      if (annotation) this.position(annotation);
    }
    return () => {
      store.unobserve(update);
      if (this.source?.store === store) this.source = null;
    };
  }

  private position(annotation: ImageAnnotation) {
    const element = this.elements.get(annotation.id);
    if (!element || !this.source) return;
    const { x, y } = liveAnchor(annotation);
    element.style.left = `${(x / this.source.width) * 100}%`;
    element.style.top = `${(y / this.source.height) * 100}%`;
  }
}
