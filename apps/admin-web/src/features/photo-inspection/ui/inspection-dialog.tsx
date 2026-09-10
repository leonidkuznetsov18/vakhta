import { useState } from 'react';
import { useStore } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type HandoverPhotoView, type PhotoInspectionView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { HowItWorks } from '@/components/app/how-it-works';
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
import { type InspectionEditor, createInspectionSession, reviewIsValid } from '../model/editor';
import { EditableReview, ReadOnlyReview } from './review-fields';
import { PredictionPanel } from './prediction-panel';
import { AnalyzeButton } from './analyze-button';
import '@annotorious/annotorious/annotorious.css';

const t = messages(currentLocale()).photoInspection;
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
    if (!editor?.store.getState().dirty || window.confirm(t.discard)) onClose();
  };
  const index =
    photos?.findIndex(
      (item) => item.media.id === photo.media.id && item.itemKey === photo.itemKey,
    ) ?? -1;
  const navigate = (delta: number) => {
    const next = photos?.[index + delta];
    if (next && (!editor?.store.getState().dirty || window.confirm(t.discard)))
      onPhotoChange?.(next);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[95dvh] w-[96vw] flex-col overflow-y-auto sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{photo.label}</DialogDescription>
          {photos && photos.length > 1 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={index <= 0}
                onClick={() => navigate(-1)}
              >
                {t.previous}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={index >= photos.length - 1}
                onClick={() => navigate(1)}
              >
                {t.next}
              </Button>
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
  const [{ editor, store, mount, attachOwner }] = useState(() =>
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
      }),
    retry: false,
    onMutate: () => editor.lock(),
    onSettled: () => editor.unlock(),
    onSuccess: (view) => {
      editor.saved(view);
      client.setQueryData(inspectionKey(id), view);
      notifySuccess(t.saved);
    },
  });
  const analyze = useMutation({
    mutationFn: () => inspectionApi.analyze(id, editor.analysisRequest()),
    retry: false,
    onSuccess: (view) => {
      editor.analysisReceived();
      client.setQueryData(inspectionKey(id), view);
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
  const valid = reviewIsValid(state);
  const error = save.error ?? analyze.error ?? exportReview.error;
  const reload = async () => {
    if (state.dirty && !window.confirm(t.discard)) return;
    await client.invalidateQueries({ queryKey: inspectionKey(id) });
    // Reload is explicit; ordinary background updates never overwrite an unsaved review.
    resetSession();
  };
  return (
    <div ref={attachOwner} className="flex min-w-0 flex-col gap-4" data-testid="photo-inspection">
      <div className="flex flex-wrap gap-2">
        {initial.canEdit && (
          <>
            {(['select', 'rectangle', 'polygon'] as const).map((tool) => (
              <Button
                key={tool}
                size="sm"
                variant={state.tool === tool ? 'default' : 'outline'}
                disabled={busy || state.imageStatus !== 'ready'}
                aria-pressed={state.tool === tool}
                onClick={() => editor.tool(tool)}
              >
                {t[tool]}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || state.imageStatus !== 'ready'}
              onClick={() => editor.addBox()}
              title={t.drawKeyboard}
            >
              {t.addBox}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={state.zoom >= 4}
          onClick={() => editor.zoom(0.5)}
        >
          {t.zoomIn}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={state.zoom <= 1}
          onClick={() => editor.zoom(-0.5)}
        >
          {t.zoomOut}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={state.dirty || latest.review.status === 'UNREVIEWED' || exportReview.isPending}
          onClick={() => exportReview.mutate()}
        >
          {t.export}
        </Button>
        {link.data && (
          <Button size="sm" variant="outline" asChild>
            <a href={link.data.url} target="_blank" rel="noreferrer">
              {t.original}
            </a>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{initial.canEdit ? t.drawHint : t.readOnly}</p>
      {error && (
        <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
          {errorText(error)}
          {error instanceof ApiError && error.code === 'INSPECTION_CONFLICT' && (
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              {t.reload}
            </Button>
          )}
        </div>
      )}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">
          <QueryFeedback
            query={{ ...link, error: link.error ? new Error(errorText(link.error)) : null }}
          />
          {link.data && (
            <div className="max-h-[65dvh] overflow-auto rounded-md border bg-muted p-2">
              {state.imageStatus === 'loading' && <LoadingState />}
              {state.imageStatus === 'failed' && (
                <p role="alert">
                  {t.imageFailed}{' '}
                  <Button variant="outline" onClick={() => void link.refetch()}>
                    {t.refresh}
                  </Button>
                </p>
              )}
              <div style={{ width: `${state.zoom * 100}%` }}>
                <img
                  key={`${link.data.url}:${link.dataUpdatedAt}`}
                  ref={mount}
                  src={link.data.url}
                  alt={initial.context.photoLabel}
                  className="block h-auto w-full max-w-none"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {initial.canEdit ? (
            <EditableReview editor={editor} busy={busy} />
          ) : (
            <ReadOnlyReview review={state.review} select={(id) => editor.select(id)} />
          )}
          {state.dirty && (
            <p role="status" className="text-sm">
              {t.dirty}
            </p>
          )}
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              {t.invalid}
            </p>
          )}
          {initial.canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !state.dirty || !valid || state.imageStatus !== 'ready'}
                onClick={() => save.mutate()}
              >
                {save.isPending && !save.isPaused ? <LoadingState label={t.save} /> : t.save}
              </Button>
              <AnalyzeButton
                review={state.review}
                disabled={busy || state.dirty || pending}
                onAnalyze={() => analyze.mutate()}
              />
            </div>
          )}
          {paused && (
            <p role="status" className="text-sm text-muted-foreground">
              {messages(currentLocale()).ui.common.waitingConnection}
            </p>
          )}
          {pending && <LoadingState label={t.aiPending} />}
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
