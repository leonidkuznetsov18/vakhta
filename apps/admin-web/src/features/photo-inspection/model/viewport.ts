export const INSPECTION_ZOOM = { min: 1, max: 5, step: 0.5 } as const;
const WHEEL_SCALE_RATE = 0.002;
const WHEEL_LINE_PIXELS = 16;
interface Point {
  x: number;
  y: number;
}
interface ViewportOwner {
  scale: () => number;
  changeScale: (scale: number) => void;
  ready: () => boolean;
  canPan: () => boolean;
}
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Owns image-only transforms and native scroll offsets; annotation data never enters this adapter. */
export class InspectionViewport {
  private plane: HTMLDivElement | null = null;
  private viewport: HTMLElement | null = null;
  constructor(private readonly owner: ViewportOwner) {}

  zoomTo(requested: number, from?: Point, to = from): void {
    const scale = Math.max(INSPECTION_ZOOM.min, Math.min(INSPECTION_ZOOM.max, requested));
    const previous = this.owner.scale();
    const plane = this.plane;
    const viewport = this.viewport;
    if (plane && viewport) {
      const bounds = viewport.getBoundingClientRect();
      const anchor = from ?? {
        x: bounds.left + viewport.clientWidth / 2,
        y: bounds.top + viewport.clientHeight / 2,
      };
      const destination = to ?? anchor;
      const image = plane.getBoundingClientRect();
      const ratio = scale / previous - 1;
      const left = viewport.scrollLeft + (anchor.x - image.left) * ratio + anchor.x - destination.x;
      const top = viewport.scrollTop + (anchor.y - image.top) * ratio + anchor.y - destination.y;
      // Write the transform before scrolling so the browser clamps against the new overflow size.
      plane.style.transform = `scale(${scale})`;
      viewport.scrollLeft = scale === INSPECTION_ZOOM.min ? 0 : left;
      viewport.scrollTop = scale === INSPECTION_ZOOM.min ? 0 : top;
    }
    this.owner.changeScale(scale);
  }

  readonly attach = (plane: HTMLDivElement | null) => {
    const viewport = plane?.parentElement;
    if (!plane || !viewport) return;
    this.plane = plane;
    this.viewport = viewport;
    plane.style.transform = `scale(${this.owner.scale()})`;
    const points = new Map<number, Point>();
    const consume = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const wheel = (event: WheelEvent) => {
      if (!this.owner.ready() || event.metaKey || event.altKey || event.shiftKey || !event.deltaY)
        return;
      consume(event);
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PIXELS
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.clientHeight
            : 1;
      this.zoomTo(this.owner.scale() * Math.exp(-event.deltaY * unit * WHEEL_SCALE_RATE), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const down = (event: PointerEvent) => {
      if (
        !this.owner.ready() ||
        (!this.owner.canPan() && event.button !== 1) ||
        (event.button !== 0 && event.button !== 1) ||
        !(event.target instanceof Node) ||
        !plane.contains(event.target)
      )
        return;
      consume(event);
      if (points.size >= 2) return;
      viewport.focus({ preventScroll: true });
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.setPointerCapture(event.pointerId);
      viewport.dataset.panning = 'true';
    };
    const move = (event: PointerEvent) => {
      const previous = points.get(event.pointerId);
      if (!previous) return;
      consume(event);
      const before = [...points.values()];
      const next = { x: event.clientX, y: event.clientY };
      points.set(event.pointerId, next);
      const after = [...points.values()];
      if (before[0] && before[1] && after[0] && after[1]) {
        const initialDistance = distance(before[0], before[1]);
        if (initialDistance > 1)
          this.zoomTo(
            (this.owner.scale() * distance(after[0], after[1])) / initialDistance,
            midpoint(before[0], before[1]),
            midpoint(after[0], after[1]),
          );
      } else {
        viewport.scrollLeft += previous.x - next.x;
        viewport.scrollTop += previous.y - next.y;
      }
    };
    const up = (event: PointerEvent) => {
      if (!points.delete(event.pointerId)) return;
      consume(event);
      if (viewport.hasPointerCapture(event.pointerId))
        viewport.releasePointerCapture(event.pointerId);
      if (!points.size) delete viewport.dataset.panning;
    };
    const click = (event: MouseEvent) => {
      if (this.owner.canPan()) consume(event);
    };
    const drag = (event: DragEvent) => event.preventDefault();
    viewport.addEventListener('wheel', wheel, { passive: false });
    viewport.addEventListener('pointerdown', down, true);
    viewport.addEventListener('pointermove', move, true);
    viewport.addEventListener('pointerup', up, true);
    viewport.addEventListener('pointercancel', up, true);
    viewport.addEventListener('lostpointercapture', up, true);
    viewport.addEventListener('click', click, true);
    plane.addEventListener('dragstart', drag);
    return () => {
      viewport.removeEventListener('wheel', wheel);
      viewport.removeEventListener('pointerdown', down, true);
      viewport.removeEventListener('pointermove', move, true);
      viewport.removeEventListener('pointerup', up, true);
      viewport.removeEventListener('pointercancel', up, true);
      viewport.removeEventListener('lostpointercapture', up, true);
      viewport.removeEventListener('click', click, true);
      plane.removeEventListener('dragstart', drag);
      for (const id of points.keys())
        if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      points.clear();
      delete viewport.dataset.panning;
      this.plane = null;
      this.viewport = null;
    };
  };
}
