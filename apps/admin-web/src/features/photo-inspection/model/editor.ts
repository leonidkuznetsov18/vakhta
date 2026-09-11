import { RegionNumberPositions } from './region-number-positions';
import { attachRegionList } from './region-navigation';
import { availableSuggestions, linkLegacySuggestions } from './suggestions';
import { InspectionViewport, INSPECTION_ZOOM } from './viewport';
export { INSPECTION_ZOOM } from './viewport';
import { hasReviewChanges } from './review-changes';
import { createStore } from 'zustand/vanilla';
import { z } from 'zod';
import {
  createImageAnnotator,
  ShapeType,
  UserSelectAction,
  type ImageAnnotation,
  type ImageAnnotator,
} from '@annotorious/annotorious';
import {
  prohibitedPhotoInstruction,
  type PhotoRuleDetail,
  InspectionGeometry,
  InspectionReview,
  type InspectionAnnotation,
  type InspectionPrediction,
  type InspectionRunView,
  type PhotoInspectionView,
} from '@vakhta/contracts';

type Geometry = InspectionAnnotation['geometry'];
export function toCanvas(
  annotation: InspectionAnnotation,
  width: number,
  height: number,
): ImageAnnotation {
  const g = annotation.geometry;
  const geometry =
    g.type === 'RECTANGLE'
      ? {
          x: g.x * width,
          y: g.y * height,
          w: g.width * width,
          h: g.height * height,
          bounds: {
            minX: g.x * width,
            minY: g.y * height,
            maxX: (g.x + g.width) * width,
            maxY: (g.y + g.height) * height,
          },
        }
      : {
          points: g.points.map(([x, y]) => [x * width, y * height]),
          bounds: {
            minX: Math.min(...g.points.map(([x]) => x)) * width,
            minY: Math.min(...g.points.map(([, y]) => y)) * height,
            maxX: Math.max(...g.points.map(([x]) => x)) * width,
            maxY: Math.max(...g.points.map(([, y]) => y)) * height,
          },
        };
  return {
    id: annotation.id,
    bodies: [],
    target: {
      annotation: annotation.id,
      selector: {
        type: g.type === 'RECTANGLE' ? ShapeType.RECTANGLE : ShapeType.POLYGON,
        geometry,
      },
    },
  };
}
const Pixels = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const Points = z.object({ points: z.array(z.tuple([z.number(), z.number()])) });
export function fromCanvas(annotation: ImageAnnotation, width: number, height: number): Geometry {
  if (annotation.target.selector.type === ShapeType.RECTANGLE) {
    const g = Pixels.parse(annotation.target.selector.geometry);
    return InspectionGeometry.parse({
      type: 'RECTANGLE',
      x: g.x / width,
      y: g.y / height,
      width: g.w / width,
      height: g.h / height,
    });
  }
  const g = Points.parse(annotation.target.selector.geometry);
  return InspectionGeometry.parse({
    type: 'POLYGON',
    points: g.points.map(([x, y]) => [x / width, y / height]),
  });
}
interface EditorState {
  review: InspectionReview;
  version: number;
  automaticRunId: string | null;
  savedReview: InspectionReview;
  selected: string | null;
  tool: 'rectangle' | 'polygon' | 'select';
  zoom: number;
  imageStatus: 'loading' | 'ready' | 'failed';
  invalidGeometry: boolean;
}

/** Owns the third-party canvas lifecycle and the unsaved form, never the server query cache. */
export class InspectionEditor {
  readonly store;
  readonly numberPositions = new RegionNumberPositions();
  private canvas: ImageAnnotator | null = null;
  private locked = false;
  private analysis: { requestId: string; version: number; guidance: string } | null = null;
  private width = 1;
  private height = 1;
  readonly viewport;
  constructor(readonly initial: PhotoInspectionView) {
    this.store = createStore<EditorState>(() => ({
      review: initial.automaticReview ?? linkLegacySuggestions(initial.review, initial.runs),
      version: initial.version,
      automaticRunId: initial.automaticRunId ?? null,
      savedReview: linkLegacySuggestions(initial.review, initial.runs),
      selected: null,
      tool: 'select',
      zoom: INSPECTION_ZOOM.min,
      imageStatus: 'loading',
      invalidGeometry: false,
    }));
    this.viewport = new InspectionViewport({
      scale: () => this.store.getState().zoom,
      changeScale: (zoom) => this.store.setState({ zoom }),
      ready: () => this.store.getState().imageStatus === 'ready',
      canPan: () => this.store.getState().tool === 'select',
    });
  }
  readonly attachRegionList = (element: HTMLDivElement | null) => attachRegionList(this, element);
  readonly mount = (image: HTMLImageElement | null) => {
    if (!image) return;
    this.store.setState({ imageStatus: 'loading' });
    let disconnectNumbers: (() => void) | undefined;
    const loaded = () => {
      if (this.canvas) return;
      this.width = image.naturalWidth;
      this.height = image.naturalHeight;
      this.canvas = createImageAnnotator(image, {
        autoSave: true,
        style: (_annotation, state) => ({
          stroke: state?.selected ? '#059669' : '#ffffff',
          strokeWidth: state?.selected ? 3 : 2,
          fill: state?.selected ? '#059669' : '#ffffff',
          fillOpacity: state?.selected ? 0.18 : 0.08,
        }),
        drawingEnabled: false,
        userSelectAction: this.initial.canEdit ? UserSelectAction.EDIT : UserSelectAction.SELECT,
      });
      this.canvas.setAnnotations(
        this.store.getState().review.annotations.map((a) => toCanvas(a, this.width, this.height)),
      );
      disconnectNumbers = this.numberPositions.connect(
        this.canvas.state.store,
        this.width,
        this.height,
      );
      this.canvas.on('createAnnotation', this.geometryChanged);
      this.canvas.on('updateAnnotation', this.geometryChanged);
      this.canvas.on('selectionChanged', (annotations) =>
        this.store.setState({ selected: annotations[0]?.id ?? null }),
      );
      this.tool(this.store.getState().tool);
      this.store.setState({ imageStatus: 'ready' });
    };
    const failed = () => this.store.setState({ imageStatus: 'failed' });
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (hasReviewChanges(this.store.getState())) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', preventLoss);
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete && image.naturalWidth) loaded();
    return () => {
      window.removeEventListener('beforeunload', preventLoss);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      disconnectNumbers?.();
      this.canvas?.destroy();
      this.canvas = null;
    };
  };
  private readonly geometryChanged = (annotation: ImageAnnotation) => {
    if (!this.initial.canEdit || this.locked) return;
    try {
      const geometry = fromCanvas(annotation, this.width, this.height);
      const state = this.store.getState();
      const previous = state.review.annotations.find((a) => a.id === annotation.id);
      const next: InspectionAnnotation = previous
        ? { ...previous, geometry }
        : {
            id: annotation.id,
            geometry,
            category: 'OTHER',
            comment: '',
            sourceRunId: null,
          };
      this.change({
        annotations: previous
          ? state.review.annotations.map((a) => (a.id === next.id ? next : a))
          : [...state.review.annotations, next],
        status: 'PROBLEMS',
      });
      this.store.setState({ selected: next.id, invalidGeometry: false });
      if (!previous) this.tool('select');
    } catch {
      this.store.setState({ invalidGeometry: true });
    }
  };
  change(patch: Partial<InspectionReview>): void {
    this.store.setState((state) => ({ review: { ...state.review, ...patch } }));
  }
  editAnnotation(
    id: string,
    patch: Partial<Pick<InspectionAnnotation, 'comment' | 'category' | 'objectName'>>,
  ): void {
    this.change({
      annotations: this.store
        .getState()
        .review.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  }
  select(id: string): void {
    this.canvas?.setSelected(id, this.initial.canEdit);
    this.store.setState({ selected: id });
  }
  removeSelected(): boolean {
    const selected = this.store.getState().selected;
    return selected !== null && this.remove(selected);
  }
  remove(id: string): boolean {
    if (
      this.locked ||
      !this.initial.canEdit ||
      !this.store.getState().review.annotations.some((a) => a.id === id)
    )
      return false;
    this.canvas?.removeAnnotation(id);
    this.change({
      annotations: this.store.getState().review.annotations.filter((a) => a.id !== id),
      status: 'UNREVIEWED',
    });
    this.store.setState({ selected: null });
    return true;
  }
  toggleDrawingTool(tool: 'rectangle' | 'polygon'): void {
    if (this.locked || !this.initial.canEdit) return;
    this.tool(this.store.getState().tool === tool ? 'select' : tool);
  }
  tool(tool: EditorState['tool']): void {
    this.canvas?.cancelDrawing();
    const drawing = tool === 'rectangle' || tool === 'polygon';
    this.canvas?.setDrawingEnabled(drawing && !this.locked && this.initial.canEdit);
    if (drawing) {
      this.canvas?.setDrawingMode(tool === 'polygon' ? 'click' : 'drag');
      this.canvas?.setDrawingTool(tool);
    }
    this.store.setState({ tool });
  }
  zoom(delta: number): void {
    this.viewport.zoomTo(this.store.getState().zoom + delta);
  }
  acceptSuggestion(run: InspectionRunView, index: number): void {
    if (this.locked || !this.initial.canEdit || run.status !== 'SUCCEEDED') return;
    const suggestion = availableSuggestions(run, this.store.getState().review).find(
      (item) => item.index === index,
    );
    if (suggestion) this.accept(suggestion.finding, run.id, index);
  }
  private accept(
    finding: InspectionPrediction['findings'][number],
    runId: string | null,
    sourceFindingIndex?: number,
  ): void {
    if (this.locked || !this.initial.canEdit || !finding.geometry) return;
    const annotation: InspectionAnnotation = {
      id: crypto.randomUUID(),
      ...finding,
      geometry: finding.geometry,
      sourceRunId: runId,
      ...(sourceFindingIndex === undefined ? {} : { sourceFindingIndex }),
    };
    this.canvas?.addAnnotation(toCanvas(annotation, this.width, this.height));
    this.change({
      annotations: [
        ...this.store.getState().review.annotations.filter((a) => a.id !== annotation.id),
        annotation,
      ],
      status: 'PROBLEMS',
    });
    this.select(annotation.id);
  }
  addBox(): void {
    this.accept(
      {
        category: 'OTHER',
        comment: '',
        geometry: { type: 'RECTANGLE', x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      },
      null,
    );
  }
  coordinates(id: string, field: 'x' | 'y' | 'width' | 'height', value: number): void {
    const annotation = this.store.getState().review.annotations.find((a) => a.id === id);
    if (!annotation || annotation.geometry.type !== 'RECTANGLE') return;
    const parsed = InspectionGeometry.safeParse({ ...annotation.geometry, [field]: value });
    if (!parsed.success) {
      this.store.setState({ invalidGeometry: true });
      return;
    }
    const next = { ...annotation, geometry: parsed.data };
    this.canvas?.updateAnnotation(toCanvas(next, this.width, this.height));
    this.change({
      annotations: this.store.getState().review.annotations.map((a) => (a.id === id ? next : a)),
    });
    this.store.setState({ invalidGeometry: false });
  }
  analysisRequest(
    items = this.initial.prohibitedItems ?? [],
    details: readonly PhotoRuleDetail[] = this.initial.prohibitedItemDetails ?? [],
  ) {
    const { version } = this.store.getState();
    const guidance = items.length ? prohibitedPhotoInstruction(items, details) : '';
    if (
      !this.analysis ||
      this.analysis.version !== version ||
      this.analysis.guidance !== guidance
    ) {
      this.analysis = { requestId: crypto.randomUUID(), version, guidance };
    }
    return this.analysis;
  }
  analysisReceived(): void {
    this.analysis = null;
  }
  lock(): void {
    this.canvas?.cancelDrawing();
    this.canvas?.cancelSelected();
    this.locked = true;
    this.canvas?.setDrawingEnabled(false);
    this.canvas?.setUserSelectAction(UserSelectAction.SELECT);
  }
  unlock(): void {
    this.locked = false;
    this.canvas?.setUserSelectAction(
      this.initial.canEdit ? UserSelectAction.EDIT : UserSelectAction.SELECT,
    );
    this.tool(this.store.getState().tool);
  }
  saved(view: PhotoInspectionView): void {
    this.analysis = null;
    this.store.setState({
      version: view.version,
      automaticRunId: view.automaticRunId ?? null,
      review: structuredClone(view.review),
      savedReview: structuredClone(view.review),
    });
  }
}

export function reviewIsValid(state: EditorState): boolean {
  return !state.invalidGeometry && InspectionReview.safeParse(state.review).success;
}

export function createInspectionSession(
  initial: PhotoInspectionView,
  register: (editor: InspectionEditor | null) => void,
) {
  const editor = new InspectionEditor(initial);
  return {
    editor,
    store: editor.store,
    mount: editor.mount,
    attachViewport: editor.viewport.attach,
    attachOwner(element: HTMLDivElement | null) {
      if (element) register(editor);
      return () => register(null);
    },
  };
}

export function canSaveReview(state: EditorState): boolean {
  return (
    (hasReviewChanges(state) || Boolean(state.automaticRunId)) &&
    reviewIsValid(state) &&
    (!state.automaticRunId || state.review.status !== 'UNREVIEWED') &&
    (state.imageStatus === 'ready' || state.review.status === 'NOT_ASSESSABLE')
  );
}
