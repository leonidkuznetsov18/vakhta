import { RegionNumberPositions } from './region-number-positions';
import { attachRegionList } from './region-navigation';
import { availableSuggestions, linkLegacySuggestions } from './suggestions';
import { InspectionViewport, INSPECTION_ZOOM } from './viewport';
export { INSPECTION_ZOOM } from './viewport';
import { hasReviewChanges, type ReviewChangeState } from './review-changes';
import { objectColor, SELECTED_COLOR } from './object-colors';
import { createStore } from 'zustand/vanilla';
import { z } from 'zod';
import {
  createImageAnnotator,
  ShapeType,
  UserSelectAction,
  type DrawingStyle,
  type ImageAnnotation,
  type ImageAnnotator,
} from '@annotorious/annotorious';
import {
  InspectionGeometry,
  InspectionReviewInput,
  reviewOutcome,
  type InspectionAnnotation,
  type InspectionFinding,
  type InspectionReview,
  type InspectionRunView,
  type PhotoInspectionView,
  type RejectionReason,
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
interface EditorState extends ReviewChangeState {
  version: number;
  selected: string | null;
  tool: 'rectangle' | 'select';
  zoom: number;
  imageStatus: 'loading' | 'ready' | 'failed';
  invalidGeometry: boolean;
}
/** The outcome is never chosen by hand: it follows the regions and the "not assessable" switch. */
function withOutcome(review: InspectionReview): InspectionReview {
  const status = reviewOutcome(review.annotations, review.status === 'NOT_ASSESSABLE');
  return {
    ...review,
    status,
    isReference: status === 'COMPLIANT' && review.isReference,
    ...(status === 'NOT_ASSESSABLE' ? {} : { notAssessableReason: undefined }),
  };
}

/** Owns the third-party canvas lifecycle and the unsaved form, never the server query cache. */
export class InspectionEditor {
  readonly store;
  readonly numberPositions = new RegionNumberPositions();
  private canvas: ImageAnnotator | null = null;
  private locked = false;
  private analysis: { requestId: string; version: number } | null = null;
  /** The run this session asked for; its findings are applied to the draft when the answer lands. */
  private awaitedRunId: string | null = null;
  private width = 1;
  private height = 1;
  private readonly openedAt = Date.now();
  readonly viewport;
  constructor(readonly initial: PhotoInspectionView) {
    const loaded = linkLegacySuggestions(initial.review, initial.runs);
    // A photo nobody saved yet starts from its computed outcome, so a clean photo is one save away.
    const review = initial.version === 0 ? withOutcome(loaded) : loaded;
    this.store = createStore<EditorState>(() => ({
      review,
      version: initial.version,
      savedReview: structuredClone(review),
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
        style: this.style,
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
  /** Boxes take the color of their object type; the selected one is outlined in the selection color. */
  private readonly style = (
    annotation: ImageAnnotation,
    state?: { selected?: boolean },
  ): DrawingStyle => {
    const region = this.store.getState().review.annotations.find((a) => a.id === annotation.id);
    const color = objectColor(region?.objectId, region?.objectName);
    return {
      stroke: state?.selected ? SELECTED_COLOR : color,
      strokeWidth: state?.selected ? 4 : 3,
      fill: color,
      fillOpacity: state?.selected ? 0.22 : 0.12,
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
            objectId: null,
            verdict: 'VIOLATION',
            comment: '',
            sourceRunId: null,
          };
      this.commit({
        annotations: previous
          ? state.review.annotations.map((a) => (a.id === next.id ? next : a))
          : [...state.review.annotations, next],
      });
      this.store.setState({ selected: next.id, invalidGeometry: false });
      if (!previous) this.tool('select');
    } catch {
      this.store.setState({ invalidGeometry: true });
    }
  };
  private commit(patch: Partial<InspectionReview>): void {
    this.store.setState((state) => ({ review: withOutcome({ ...state.review, ...patch }) }));
    // Object choices change colors; the canvas only re-reads the style when it is set again.
    if (patch.annotations) this.canvas?.setStyle(this.style);
  }
  change(
    patch: Partial<Pick<InspectionReview, 'comment' | 'isReference' | 'notAssessableReason'>>,
  ) {
    this.commit(patch);
  }
  setNotAssessable(flag: boolean): void {
    this.commit({ status: flag ? 'NOT_ASSESSABLE' : 'UNREVIEWED' });
  }
  editAnnotation(
    id: string,
    patch: Partial<Pick<InspectionAnnotation, 'comment' | 'objectId' | 'objectName' | 'verdict'>>,
  ): void {
    this.commit({
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
    this.commit({
      annotations: this.store.getState().review.annotations.filter((a) => a.id !== id),
    });
    this.store.setState({ selected: null });
    return true;
  }
  toggleDrawingTool(tool: 'rectangle'): void {
    if (this.locked || !this.initial.canEdit) return;
    this.tool(this.store.getState().tool === tool ? 'select' : tool);
  }
  tool(tool: EditorState['tool']): void {
    this.canvas?.cancelDrawing();
    const drawing = tool === 'rectangle';
    this.canvas?.setDrawingEnabled(drawing && !this.locked && this.initial.canEdit);
    if (drawing) {
      this.canvas?.setDrawingMode('drag');
      this.canvas?.setDrawingTool('rectangle');
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
  /** A rejection is a recorded false positive: the finding leaves the list but stays attributable. */
  rejectSuggestion(run: InspectionRunView, index: number, reason: RejectionReason): void {
    if (this.locked || !this.initial.canEdit || run.status !== 'SUCCEEDED') return;
    const review = this.store.getState().review;
    if (!availableSuggestions(run, review).some((item) => item.index === index)) return;
    this.commit({
      rejectedFindings: [...review.rejectedFindings, { runId: run.id, index, reason }],
    });
  }
  /** Drops an AI-drawn region and records why: the rejection outlives the region. */
  rejectRegion(id: string, reason: RejectionReason): boolean {
    const region = this.store.getState().review.annotations.find((a) => a.id === id);
    if (!region?.sourceRunId || region.sourceFindingIndex === undefined || !this.remove(id))
      return false;
    const { sourceRunId: runId, sourceFindingIndex: index } = region;
    this.commit({
      rejectedFindings: [
        ...this.store.getState().review.rejectedFindings,
        { runId, index, reason },
      ],
    });
    return true;
  }
  restoreSuggestion(run: InspectionRunView, index: number): void {
    if (this.locked || !this.initial.canEdit) return;
    this.commit({
      rejectedFindings: this.store
        .getState()
        .review.rejectedFindings.filter((r) => !(r.runId === run.id && r.index === index)),
    });
  }
  private accept(finding: InspectionFinding, runId: string | null, sourceFindingIndex?: number) {
    if (this.locked || !this.initial.canEdit || !finding.geometry) return;
    const annotation: InspectionAnnotation = {
      id: crypto.randomUUID(),
      geometry: finding.geometry,
      category: finding.category,
      objectId: finding.objectId,
      ...(finding.objectName ? { objectName: finding.objectName } : {}),
      verdict: 'VIOLATION',
      comment: finding.objectId ? '' : finding.comment,
      sourceRunId: runId,
      ...(sourceFindingIndex === undefined ? {} : { sourceFindingIndex }),
    };
    this.canvas?.addAnnotation(toCanvas(annotation, this.width, this.height));
    this.commit({
      annotations: [
        ...this.store.getState().review.annotations.filter((a) => a.id !== annotation.id),
        annotation,
      ],
    });
    this.select(annotation.id);
  }
  addBox(): void {
    this.accept(
      {
        category: 'OTHER',
        objectId: null,
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
    this.commit({
      annotations: this.store.getState().review.annotations.map((a) => (a.id === id ? next : a)),
    });
    this.store.setState({ invalidGeometry: false });
  }
  /** One request identity per review version, so a retry after a lost response is not a second run. */
  analysisRequest() {
    const { version } = this.store.getState();
    if (!this.analysis || this.analysis.version !== version)
      this.analysis = { requestId: crypto.randomUUID(), version };
    return this.analysis;
  }
  /** Admission succeeded: remember the pending run so its answer is applied when it arrives. */
  analysisReceived(view?: PhotoInspectionView): void {
    this.analysis = null;
    this.awaitedRunId = view?.runs.find((run) => run.status === 'PENDING')?.id ?? null;
  }
  /**
   * The answer to this session's request draws every located finding on the photo at once; the
   * reviewer then keeps, corrects or rejects boxes instead of adding them one by one.
   */
  analysisResolved(view: PhotoInspectionView): boolean {
    if (!this.awaitedRunId) return false;
    const run = view.runs.find((item) => item.id === this.awaitedRunId);
    if (!run || run.status === 'PENDING') return false;
    this.awaitedRunId = null;
    if (run.status !== 'SUCCEEDED' || !this.initial.canEdit) return false;
    let applied = false;
    for (const { finding, index } of availableSuggestions(run, this.store.getState().review)) {
      if (!finding.geometry) continue;
      this.accept(finding, run.id, index);
      applied = true;
    }
    return applied;
  }
  /** Milliseconds this editor has been open: review-time evidence stored with the revision. */
  durationMs(): number {
    return Math.max(0, Date.now() - this.openedAt);
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
      review: structuredClone(view.review),
      savedReview: structuredClone(view.review),
    });
  }
}

export function reviewIsValid(state: EditorState): boolean {
  return !state.invalidGeometry && InspectionReviewInput.safeParse(state.review).success;
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

/** Saving needs a change: the button never offers to store what is already stored. */
export function canSaveReview(state: EditorState): boolean {
  return (
    hasReviewChanges(state) &&
    reviewIsValid(state) &&
    (state.imageStatus === 'ready' || state.review.status === 'NOT_ASSESSABLE')
  );
}
