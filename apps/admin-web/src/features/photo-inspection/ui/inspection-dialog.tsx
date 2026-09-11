import { hasReviewChanges } from '../model/review-changes';
import { useState } from 'react';
import { useStore } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type HandoverPhotoView, type PhotoInspectionView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SquareIcon,
  PentagonIcon,
  SquarePlusIcon,
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
import { HowItWorks } from '@/components/app/how-it-works';
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
import { RegionNumbers } from './region-numbers';
import { AnalyzeButton } from './analyze-button';
import { InspectionRules } from './inspection-rules';
import { reviewFeedback } from '../model/review-feedback';
import '@annotorious/annotorious/annotorious.css';

const t = messages(currentLocale()).photoInspection;
const toolIcons = { rectangle: SquareIcon, polygon: PentagonIcon };
const errorText = (error: unknown) =>
  error instanceof ApiError && error.code === 'INSPECTION_CONFLICT'
    ? t.conflict
    : error instanceof ApiError && error.code === 'INSPECTION_LIMIT'
      ? t.limit
      : error instanceof ApiError && error.code === 'INSPECTION_PENDING'
        ? t.aiPending
        : t.error;

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
  const query = useQuery({
    queryKey: inspectionKey(id),
    queryFn: ({ signal }) => inspectionApi.get(id, signal),
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[95dvh] w-[96vw] flex-col overflow-y-auto sm:max-w-7xl"
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
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{photo.label}</DialogDescription>
          {photos && photos.length > 1 && (
            <div className="flex gap-2">
              <IconButton
                size="sm"
                variant="outline"
                icon={ArrowLeftIcon}
                label={t.previous}
                tooltip={t.hints.previous}
                disabled={index <= 0}
                onClick={() => navigate(-1)}
              >
                {t.previous}
              </IconButton>
              <IconButton
                size="sm"
                variant="outline"
                icon={ArrowRightIcon}
                label={t.next}
                tooltip={t.hints.next}
                disabled={index >= photos.length - 1}
                onClick={() => navigate(1)}
              >
                {t.next}
              </IconButton>
            </div>
          )}
        </DialogHeader>
        <HowItWorks guide="photoInspection" compact />
        <QueryFeedback
          query={{ ...query, error: query.error ? new Error(errorText(query.error)) : null }}
        />
        {query.data && (
          <InspectionSession
            key={`${handoverId}:${photo.media.id}:${photo.itemKey}:${generation}`}
            id={id}
            initial={query.data}
            latest={query.data}
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
}: {
  id: InspectionIdentity;
  initial: PhotoInspectionView;
  latest: PhotoInspectionView;
  register: (editor: InspectionEditor | null) => void;
  reload: () => void;
}) {
  const [{ editor, store, mount, attachViewport, attachOwner }] = useState(() =>
    createInspectionSession(initial, register),
  );
  const state = useStore(store);
  const client = useQueryClient();
  const link = useQuery({
    queryKey: [...inspectionKey(id), 'link'],
    queryFn: ({ signal }) => inspectionApi.link(id, signal),
    staleTime: 0,
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: () =>
      inspectionApi.save(id, {
        version: editor.store.getState().version,
        review: editor.store.getState().review,
        ...(editor.store.getState().automaticRunId
          ? { automaticRunId: editor.store.getState().automaticRunId ?? undefined }
          : {}),
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
    mutationFn: () =>
      inspectionApi.analyze(
        id,
        editor.analysisRequest(latest.prohibitedItems ?? [], latest.prohibitedItemDetails ?? []),
      ),
    retry: false,
    onSuccess: (view) => {
      editor.analysisReceived();
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
  const exportReview = useMutation({
    mutationFn: () => inspectionApi.export(id),
    retry: false,
    onSuccess: (value) => downloadJson(value, id.mediaId),
  });
  const busy = save.isPending || analyze.isPending;
  const paused = save.isPaused || analyze.isPaused || exportReview.isPaused;
  const pending = latest.runs.some((r) => r.status === 'PENDING');
  const feedback = reviewFeedback(state.review, state.invalidGeometry);
  const error = save.error ?? analyze.error ?? exportReview.error;
  const reload = async () => {
    if (hasReviewChanges(state) && !window.confirm(t.discard)) return;
    await client.invalidateQueries({ queryKey: inspectionKey(id) });
    // Reload is explicit; ordinary background updates never overwrite an unsaved review.
    resetSession();
  };
  return (
    <div
      ref={attachOwner}
      className="flex min-w-0 flex-col gap-4"
      data-testid="photo-inspection"
      onKeyDownCapture={(event) => deleteSelectedOnKeyDown(event.nativeEvent, editor, busy)}
    >
      <div className="flex flex-wrap gap-2">
        {initial.canEdit && (
          <>
            {(['rectangle', 'polygon'] as const).map((tool) => (
              <IconButton
                icon={toolIcons[tool]}
                label={t[tool]}
                tooltip={`${t[tool]}. ${t.hints[tool]}`}
                key={tool}
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
              size="icon-lg"
              variant="outline"
              disabled={busy || state.imageStatus !== 'ready'}
              onClick={() => editor.addBox()}
              icon={SquarePlusIcon}
              label={t.addBox}
              tooltip={`${t.addBox}. ${t.drawKeyboard}`}
              title={t.drawKeyboard}
            >
              <span className="sr-only">{t.addBox}</span>
            </IconButton>
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
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <p>{initial.canEdit ? t.drawHint : t.readOnly}</p>
        <InfoTip text={t.gestureHint} />
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
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">
          <QueryFeedback
            query={{ ...link, error: link.error ? new Error(errorText(link.error)) : null }}
          />
          {link.data && (
            <div
              data-testid="inspection-image-viewport"
              tabIndex={0}
              role="group"
              aria-label={initial.context.photoLabel}
              className={`max-h-[65dvh] overflow-auto rounded-md border bg-muted p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring data-[panning=true]:cursor-grabbing ${state.tool === 'select' ? 'touch-none cursor-grab' : ''}`}
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
              <div ref={attachViewport} className="relative origin-top-left">
                <img
                  key={`${link.data.url}:${link.dataUpdatedAt}`}
                  ref={mount}
                  src={link.data.url}
                  alt={initial.context.photoLabel}
                  draggable={false}
                  className="block h-auto w-full max-w-none"
                />
                <RegionNumbers editor={editor} />
              </div>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {state.automaticRunId && (
            <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
              {t.automaticReview}
            </p>
          )}
          {latest.automaticRunId && latest.automaticRunId !== state.automaticRunId && (
            <IconButton
              icon={RefreshCwIcon}
              label={t.reload}
              tooltip={t.automaticReview}
              onClick={reload}
            />
          )}
          {initial.canEdit ? (
            <EditableReview editor={editor} busy={busy} items={latest.prohibitedItems ?? []} />
          ) : (
            <ReadOnlyReview editor={editor} />
          )}
          <InspectionRules
            items={latest.prohibitedItems ?? []}
            details={latest.prohibitedItemDetails ?? []}
          />
          {hasReviewChanges(state) && (
            <p role="status" className="text-sm text-muted-foreground">
              {t.dirty}
            </p>
          )}
          {feedback && initial.canEdit && (
            <p role="status" className="text-sm text-muted-foreground">
              {t.validation[feedback.key]}
              {feedback.regions.length ? ` ${feedback.regions.join(', ')}` : ''}
            </p>
          )}
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
                disabled={busy || pending}
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
          <PredictionPanel
            latest={latest}
            editor={editor}
            disabled={busy || !initial.canEdit || state.imageStatus !== 'ready'}
          />
        </div>
      </div>
    </div>
  );
}
