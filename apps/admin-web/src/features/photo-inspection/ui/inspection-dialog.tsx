import { WorkflowSection } from '@/shared/ui/workflow-section';
import { AnalysisLimits } from './analysis-limits';
import { analysisLimitsView } from '../model/analysis-limits';
import { hasReviewChanges, reviewChanges } from '../model/review-changes';
import { useState } from 'react';
import { useStore } from 'zustand';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AiFeedbackRating,
  type HandoverPhotoView,
  type PhotoInspectionView,
  type PhotoObjectsView,
  type PhotoObjectView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import {
  PentagonIcon,
  SquareIcon,
  ZoomInIcon,
  ZoomOutIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  SaveIcon,
  XIcon,
  Trash2Icon,
} from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { FaqButton } from '@/components/app/how-it-works';
import { InfoTip } from '@/components/app/info-tip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QueryFeedback } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { notifySuccess } from '@/lib/toast';
import {
  downloadJson,
  inspectionApi,
  inspectionKey,
  analysisLimitsKey,
  photoObjectsKey,
  type InspectionIdentity,
} from '../api/inspection-api';
import {
  type InspectionEditor,
  createInspectionSession,
  canSaveReview,
  INSPECTION_ZOOM,
} from '../model/editor';
import { EditableReview, ReadOnlyReview } from './review-fields';
import { PredictionPanel } from './prediction-panel';
import { deleteSelectedOnKeyDown } from '../model/delete-shortcut';
import { InspectionPhotoNavigation, type PhotoNavigation } from './photo-navigation';
import { RegionNumbers } from './region-numbers';
import { colorSources } from '../model/object-colors';

/** The catalog as last fetched, for box colors of objects outside the checklist list. */
function cachedObjects(client: QueryClient): PhotoObjectView[] {
  return client.getQueryData<PhotoObjectsView>(photoObjectsKey)?.objects ?? [];
}
import { AnalyzeButton } from './analyze-button';
import { InspectionRules } from './inspection-rules';
import { reviewFeedback } from '../model/review-feedback';
import '@annotorious/annotorious/annotorious.css';

const t = messages(currentLocale()).photoInspection;
/** The two drawing tools: a dragged box for most objects, a clicked outline for irregular ones. */
const toolIcons = { rectangle: SquareIcon, polygon: PentagonIcon } as const;
const errorText = (error: unknown) =>
  error instanceof ApiError && error.code === 'INSPECTION_CONFLICT'
    ? t.conflict
    : error instanceof ApiError && error.code === 'INSPECTION_LIMIT'
      ? t.limit
      : error instanceof ApiError && error.code === 'INSPECTION_PENDING'
        ? t.aiPending
        : error instanceof ApiError && error.code === 'INSPECTION_RULES_MISSING'
          ? t.aiRulesMissing
          : t.error;

/** Start on the workspace title so opening help never obscures the photo label. */
function focusInspectionHeading(event: Event) {
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget
      .querySelector<HTMLElement>('[data-slot="dialog-title"]')
      ?.focus({ preventScroll: true });
}

export function PhotoInspectionDialog({
  handoverId,
  photo,
  onClose,
  photos,
  onPhotoChange,
}: {
  handoverId: string;
  photo: HandoverPhotoView;
  onClose: () => void;
  photos?: HandoverPhotoView[];
  onPhotoChange?: (photo: HandoverPhotoView) => void;
}) {
  const id = { handoverId, mediaId: photo.media.id, itemKey: photo.itemKey };
  const client = useQueryClient();
  const query = useQuery({
    queryKey: inspectionKey(id),
    queryFn: async ({ signal }) => {
      const view = await inspectionApi.get(id, signal);
      // The answer to this session's analysis lands in the draft as soon as it is fetched, and
      // fresh rules recolor the boxes so they keep matching the chips.
      editor?.analysisResolved(view);
      editor?.useColors(colorSources(view.rules, cachedObjects(client)));
      return view;
    },
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === 'PENDING') ? 2000 : false,
  });
  const [generation, setGeneration] = useState(0);
  const [editor, setEditor] = useState<InspectionEditor | null>(null);
  const close = () => {
    if (!editor || !hasReviewChanges(editor.store.getState()) || window.confirm(t.discard))
      onClose();
  };
  const index =
    photos?.findIndex(
      (item) => item.media.id === photo.media.id && item.itemKey === photo.itemKey,
    ) ?? -1;
  const navigate = (delta: number) => {
    const next = photos?.[index + delta];
    if (
      next &&
      (!editor || !hasReviewChanges(editor.store.getState()) || window.confirm(t.discard))
    )
      onPhotoChange?.(next);
  };
  const navigation =
    photos && photos.length > 1 && onPhotoChange
      ? { index, count: photos.length, previous: () => navigate(-1), next: () => navigate(1) }
      : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={focusInspectionHeading}
        className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col gap-3 overflow-hidden p-3 sm:max-w-7xl sm:p-5"
      >
        <div className="absolute top-2 right-2">
          <IconButton
            data-slot="dialog-close"
            icon={XIcon}
            label={messages(currentLocale()).ui.common.close}
            tooltip={t.hints.close}
            variant="ghost"
            size="icon-sm"
            onClick={close}
          >
            <span className="sr-only">{messages(currentLocale()).ui.common.close}</span>
          </IconButton>
        </div>
        <DialogHeader className="shrink-0 pr-8 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle tabIndex={-1}>{t.title}</DialogTitle>
            <InfoTip text={`${query.data?.canEdit ? t.drawHint : t.readOnly} ${t.gestureHint}`} />
            <div className="ml-auto">
              <FaqButton guide="photoInspection" />
            </div>
          </div>
          <DialogDescription>{photo.label}</DialogDescription>
        </DialogHeader>

        <QueryFeedback
          query={{ ...query, error: query.error ? new Error(errorText(query.error)) : null }}
        />
        {!query.data && navigation && (
          <div className="relative min-h-12">
            <InspectionPhotoNavigation navigation={navigation} />
          </div>
        )}
        {query.data && (
          <InspectionSession
            key={`${handoverId}:${photo.media.id}:${photo.itemKey}:${generation}`}
            id={id}
            initial={query.data}
            latest={query.data}
            navigation={navigation}
            register={setEditor}
            reload={() => setGeneration((n) => n + 1)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InspectionSession({
  id,
  initial,
  latest,
  register,
  reload: resetSession,
  navigation,
}: {
  id: InspectionIdentity;
  initial: PhotoInspectionView;
  latest: PhotoInspectionView;
  register: (editor: InspectionEditor | null) => void;
  reload: () => void;
  navigation?: PhotoNavigation;
}) {
  const client = useQueryClient();
  const [{ editor, store, mount, attachViewport, attachOwner }] = useState(() => {
    const session = createInspectionSession(initial, register);
    session.editor.useColors(colorSources(initial.rules, cachedObjects(client)));
    return session;
  });
  const state = useStore(store);
  const changes = reviewChanges(state);
  const link = useQuery({
    queryKey: [...inspectionKey(id), 'link'],
    queryFn: ({ signal }) => inspectionApi.link(id, signal),
    staleTime: 0,
    gcTime: 0,
  });
  const limits = useQuery({
    queryKey: analysisLimitsKey(id),
    queryFn: ({ signal }) => inspectionApi.limits(id, signal),
    refetchInterval: 30_000,
    retry: false,
  });
  const quota = analysisLimitsView(limits, t);
  const objects = useQuery({
    queryKey: photoObjectsKey,
    queryFn: async ({ signal }) => {
      const view = await inspectionApi.objects(signal);
      editor.useColors(colorSources(latest.rules, view.objects));
      return view;
    },
    staleTime: 60_000,
  });
  const colors = colorSources(latest.rules, objects.data?.objects ?? []);
  const save = useMutation({
    mutationFn: () =>
      inspectionApi.save(id, {
        version: editor.store.getState().version,
        review: editor.store.getState().review,
        durationMs: editor.durationMs(),
      }),
    retry: false,
    onMutate: () => editor.lock(),
    onSettled: () => editor.unlock(),
    onSuccess: (view) => {
      editor.saved(view);
      client.setQueryData(inspectionKey(id), view);
      void client.invalidateQueries({ queryKey: ['handovers'] });
      void client.invalidateQueries({ queryKey: ['photo-library'] });
      notifySuccess(t.saved);
    },
  });
  const analyze = useMutation({
    mutationFn: () => inspectionApi.analyze(id, editor.analysisRequest()),
    retry: false,
    onSettled: async () => {
      await client.cancelQueries({ queryKey: ['photo-analysis-limits'] });
      await client.invalidateQueries({ queryKey: ['photo-analysis-limits'] });
    },
    onSuccess: (view) => {
      void client.invalidateQueries({ queryKey: ['photo-library'] });
      editor.analysisReceived(view);
      client.setQueryData(inspectionKey(id), view);
    },
  });
  /**
   * The run this session asked for, once it has come back with an answer. The identity comes from
   * the run itself rather than from a clock, so a reader who opens a photo that was analysed
   * yesterday is not congratulated for it, and a second analysis celebrates a second time.
   */
  const requestedRunId = analyze.data?.runs[0]?.id ?? null;
  const newestRun = latest.runs[0];
  const finishedRunId =
    requestedRunId !== null && newestRun?.id === requestedRunId && newestRun.status === 'SUCCEEDED'
      ? newestRun.id
      : null;
  const createObject = useMutation({
    mutationFn: (name: string) => inspectionApi.createObject({ name }),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: photoObjectsKey });
    },
  });
  const rate = useMutation({
    mutationFn: ({ runId, rating }: { runId: string; rating: AiFeedbackRating }) =>
      inspectionApi.rateRun(id, runId, { rating }),
    retry: false,
    onSuccess: (view) => {
      client.setQueryData(inspectionKey(id), view);
      void client.invalidateQueries({ queryKey: ['photo-library'] });
    },
  });
  const exportReview = useMutation({
    mutationFn: () => inspectionApi.export(id),
    retry: false,
    onSuccess: (value) => downloadJson(value, id.mediaId),
  });
  const busy = save.isPending || analyze.isPending;
  const paused = save.isPaused || analyze.isPaused || exportReview.isPaused;
  const pending = latest.runs.some((r) => r.status === 'PENDING');
  const feedback = reviewFeedback(state.review, state.invalidGeometry);
  const error =
    save.error ?? analyze.error ?? exportReview.error ?? rate.error ?? createObject.error;
  const reload = async () => {
    if (hasReviewChanges(state) && !window.confirm(t.discard)) return;
    await client.invalidateQueries({ queryKey: inspectionKey(id) });
    // Reload is explicit; ordinary background updates never overwrite an unsaved review.
    resetSession();
  };
  return (
    <div
      ref={attachOwner}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      data-testid="photo-inspection"
      onKeyDownCapture={(event) => deleteSelectedOnKeyDown(event.nativeEvent, editor, busy)}
    >
      <div className="flex flex-wrap gap-2">
        {initial.canEdit && (
          <>
            {(['rectangle', 'polygon'] as const).map((tool) => (
              <IconButton
                key={tool}
                icon={toolIcons[tool]}
                label={t[tool]}
                tooltip={`${t[tool]}. ${t.hints[tool]}`}
                size="icon-lg"
                variant={state.tool === tool ? 'default' : 'outline'}
                disabled={busy || state.imageStatus !== 'ready'}
                aria-pressed={state.tool === tool}
                onClick={() => editor.toggleDrawingTool(tool)}
              >
                <span className="sr-only">{t[tool]}</span>
              </IconButton>
            ))}
            <IconButton
              icon={Trash2Icon}
              label={t.removeSelected}
              tooltip={state.selected ? t.deleteShortcutHint : t.selectToDeleteHint}
              size="icon-lg"
              variant="outline"
              disabled={busy || state.imageStatus !== 'ready' || !state.selected}
              aria-keyshortcuts="Backspace Delete"
              onClick={() => editor.removeSelected()}
            >
              <span className="sr-only">{t.removeSelected}</span>
            </IconButton>
          </>
        )}
        <IconButton
          size="icon-lg"
          variant="outline"
          icon={ZoomInIcon}
          label={t.zoomIn}
          tooltip={`${t.zoomIn}. ${t.hints.zoomIn}`}
          disabled={state.zoom >= INSPECTION_ZOOM.max}
          onClick={() => editor.zoom(INSPECTION_ZOOM.step)}
        >
          <span className="sr-only">{t.zoomIn}</span>
        </IconButton>
        <IconButton
          size="icon-lg"
          variant="outline"
          icon={ZoomOutIcon}
          label={t.zoomOut}
          tooltip={`${t.zoomOut}. ${t.hints.zoomOut}`}
          disabled={state.zoom <= INSPECTION_ZOOM.min}
          onClick={() => editor.zoom(-INSPECTION_ZOOM.step)}
        >
          <span className="sr-only">{t.zoomOut}</span>
        </IconButton>
        <IconButton
          size="icon-lg"
          variant="outline"
          icon={DownloadIcon}
          label={t.export}
          tooltip={`${t.export}. ${t.hints.export}`}
          disabled={
            hasReviewChanges(state) ||
            latest.review.status === 'UNREVIEWED' ||
            exportReview.isPending
          }
          onClick={() => exportReview.mutate()}
        >
          <span className="sr-only">{t.export}</span>
        </IconButton>
        {link.data && (
          <IconButton
            icon={ExternalLinkIcon}
            label={t.original}
            tooltip={`${t.original}. ${t.hints.original}`}
            size="icon-lg"
            variant="outline"
            asChild
          >
            <a href={link.data.url} target="_blank" rel="noreferrer">
              <span className="sr-only">{t.original}</span>
            </a>
          </IconButton>
        )}
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
          {errorText(error)}
          {error instanceof ApiError && error.code === 'INSPECTION_CONFLICT' && (
            <IconButton
              variant="outline"
              size="sm"
              icon={RefreshCwIcon}
              label={t.reload}
              tooltip={t.hints.reload}
              onClick={() => void reload()}
            >
              {t.reload}
            </IconButton>
          )}
        </div>
      )}
      {/* Wide screens: the photo and the form share the dialog's remaining height. The photo fits
          that height at 100% zoom and the form is the single scrolling column; no scroll nests. */}
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto [container-type:size] lg:overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="relative flex min-w-0 flex-col gap-2 lg:min-h-0">
          <QueryFeedback
            query={{ ...link, error: link.error ? new Error(errorText(link.error)) : null }}
          />
          {link.data && (
            <div
              data-testid="inspection-image-viewport"
              tabIndex={0}
              role="group"
              aria-label={initial.context.photoLabel}
              style={{
                aspectRatio: `${state.imageSize?.width ?? initial.context.encodedWidth} / ${state.imageSize?.height ?? initial.context.encodedHeight}`,
              }}
              className={`h-auto max-h-[min(48dvh,calc(100cqh-3rem))] shrink-0 overflow-auto rounded-md border bg-muted p-2 [container-type:size] outline-none focus-visible:ring-2 focus-visible:ring-ring data-[panning=true]:cursor-grabbing lg:max-h-none lg:min-h-0 lg:flex-1 lg:aspect-auto! ${state.tool === 'select' ? 'touch-none cursor-grab' : ''}`}
            >
              {state.imageStatus === 'loading' && <LoadingState />}
              {state.imageStatus === 'failed' && (
                <p role="alert">
                  {t.imageFailed}{' '}
                  <IconButton
                    variant="outline"
                    icon={RefreshCwIcon}
                    label={t.refresh}
                    tooltip={t.hints.refresh}
                    onClick={() => void link.refetch()}
                  >
                    {t.refresh}
                  </IconButton>
                </p>
              )}
              <div
                ref={attachViewport}
                className="relative mx-auto origin-top-left [&>div]:align-top"
                style={
                  state.imageSize
                    ? {
                        aspectRatio: `${state.imageSize.width} / ${state.imageSize.height}`,
                        width: `min(100cqw, calc(100cqh * ${state.imageSize.width / state.imageSize.height}))`,
                        marginBlock: `max(0px, calc((100cqh - min(100cqh, calc(100cqw / ${state.imageSize.width / state.imageSize.height}))) / 2))`,
                      }
                    : undefined
                }
              >
                <img
                  key={`${link.data.url}:${link.dataUpdatedAt}`}
                  ref={mount}
                  src={link.data.url}
                  alt={initial.context.photoLabel}
                  draggable={false}
                  className="block h-auto w-full max-w-none"
                />
                <RegionNumbers editor={editor} colors={colors} />
              </div>
            </div>
          )}
          {navigation && <InspectionPhotoNavigation navigation={navigation} />}
        </div>
        {/* On wide screens the form column is as tall as the photo viewport and scrolls inside;
            the action footer is a separate sibling and never participates in this scroll. */}
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <WorkflowSection
            title={messages(currentLocale()).ui.workflow.photoReview}
            emphasis={initial.canEdit ? 'action' : 'neutral'}
          >
            {initial.canEdit ? (
              <EditableReview
                editor={editor}
                busy={busy}
                rules={latest.rules}
                objects={objects.data?.objects ?? []}
                onCreateObject={(name) => createObject.mutateAsync(name)}
              />
            ) : (
              <ReadOnlyReview editor={editor} objects={objects.data?.objects ?? []} />
            )}
          </WorkflowSection>
          <PredictionPanel
            latest={latest}
            editor={editor}
            onRate={(runId, rating) => rate.mutate({ runId, rating })}
            disabled={busy || !initial.canEdit || state.imageStatus !== 'ready'}
          />
          <InspectionRules rules={latest.rules} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t bg-background pt-3">
        {hasReviewChanges(state) && (
          <p role="status" className="text-sm text-muted-foreground">
            {t.dirty}: {changes.total}
          </p>
        )}
        {feedback && initial.canEdit && (
          <p role="status" className="text-sm text-muted-foreground">
            {t.validation[feedback.key]}
            {feedback.regions.length ? ` ${feedback.regions.join(', ')}` : ''}
          </p>
        )}
        <AnalysisLimits
          view={quota}
          retry={() => {
            void limits.refetch();
          }}
        />
        {initial.canEdit && (
          <div className="flex flex-wrap gap-2">
            <IconButton
              disabled={busy || !canSaveReview(state)}
              icon={SaveIcon}
              label={t.save}
              tooltip={t.hints.save}
              onClick={() => save.mutate()}
            >
              {save.isPending && !save.isPaused ? <LoadingState label={t.save} /> : t.save}
            </IconButton>
            <AnalyzeButton
              disabled={busy || pending || latest.rules.length === 0}
              disabledReason={quota.disabledReason ?? (save.isPending ? t.analysisSaving : null)}
              loading={(analyze.isPending && !analyze.isPaused) || pending}
              finished={finishedRunId}
              onAnalyze={() => analyze.mutate()}
            />
          </div>
        )}
        {paused && (
          <p role="status" className="text-sm text-muted-foreground">
            {messages(currentLocale()).ui.common.waitingConnection}
          </p>
        )}
      </div>
    </div>
  );
}
