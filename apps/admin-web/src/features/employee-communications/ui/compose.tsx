import { useState, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import { PaperclipIcon, Trash2Icon, FileIcon, RefreshCwIcon, SendIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Feedback } from '@/components/app/feedback';
import { TableCount } from '@/components/app/data-table';
import { LoadingState } from '@/shared/ui/loading-state';
import { IconButton } from '@/shared/ui/icon-button';
import { communicationApi, communicationKey } from '../api/communications';
import { useCommunicationDraft } from '../model/context';
import { draftCommand, type DraftFile } from '../model/draft';
import { communicationError } from '../model/feedback';
import { Audience } from './audience';
import { QuestionnaireEditor } from './questionnaire-editor';

const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const readOnline = () => onlineManager.isOnline();
export function Compose() {
  const t = messages(currentLocale()).communications;
  const draft = useCommunicationDraft();
  const state = useStore(draft.store);
  const client = useQueryClient();
  const { actorId } = useNavigation();
  const [reviewPage, setReviewPage] = useState(1);
  const command = draftCommand(state);
  const online = useSyncExternalStore(subscribeOnline, readOnline);
  const locked = state.phase === 'SUBMITTING' || state.phase === 'UNCERTAIN';
  const upload = useMutation({
    mutationFn: (file: DraftFile) => communicationApi.upload(file.file, file.controller.signal),
  });
  const remove = useMutation({ mutationFn: (id: string) => communicationApi.discard(id) });
  async function uploadFile(row: DraftFile) {
    try {
      if (row.file.size > 10 * 1024 * 1024 || !row.file.size)
        throw new Error(t.errors.COMMUNICATION_FILE_SIZE);
      const attachment = await upload.mutateAsync(row);
      if (!draft.store.getState().files.some((file) => file.id === row.id)) {
        remove.mutate(attachment.id);
        return;
      }
      draft.finishFile(row.id, { attachment });
    } catch (error) {
      if (!row.controller.signal.aborted) draft.finishFile(row.id, { error });
    }
  }
  const send = useMutation({
    mutationFn: ({
      value,
    }: {
      value: NonNullable<ReturnType<typeof draftCommand>>;
      reconciling: boolean;
    }) => communicationApi.create(value),
    onSuccess: (result) => {
      draft.reset();
      draft.update({ view: 'history', detailId: result.id });
      void client.invalidateQueries({ queryKey: communicationKey(actorId ?? '') });
    },
    onError: (error, input) => {
      const rejected =
        !input.reconciling &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500;
      draft.update({
        phase: rejected ? 'EDITING' : 'UNCERTAIN',
        error,
        ...(rejected ? { requestId: crypto.randomUUID() } : {}),
      });
    },
  });
  function submit() {
    const current = draft.store.getState();
    const value = draftCommand(current);
    if (!value || current.phase === 'SUBMITTING' || !onlineManager.isOnline()) return;
    if ((current.recipients.length > 1 || current.questionnaire) && current.phase === 'EDITING') {
      draft.update({ phase: 'REVIEW' });
      return;
    }
    draft.update({ phase: 'SUBMITTING', error: null });
    send.mutate({ value, reconciling: current.phase === 'UNCERTAIN' });
  }
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {state.pendingContext && (
          <div className="mb-5 space-y-3 rounded-lg border bg-muted/50 p-3">
            <p className="text-sm font-medium">{t.draftExists}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => draft.update({ pendingContext: null })}
              >
                {t.keepDraft}
              </Button>
              <Button type="button" disabled={locked} onClick={() => draft.replaceContext()}>
                {t.replaceDraft}
              </Button>
            </div>
          </div>
        )}
        <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-70">
          {state.phase === 'REVIEW' ? (
            <section className="space-y-3">
              <h3 className="font-semibold">{t.review}</h3>
              <p className="whitespace-pre-wrap break-words">{state.text}</p>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {format(t.selected, { count: state.recipients.length })}
                </summary>
                <ul className="mt-3 max-h-52 overflow-y-auto text-sm">
                  {state.recipients.slice((reviewPage - 1) * 30, reviewPage * 30).map((person) => (
                    <li key={person.id} className="py-1">
                      {person.fullName} · {person.personnelNumber}
                    </li>
                  ))}
                </ul>
                <TableCount total={state.recipients.length} />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={reviewPage <= 1}
                    onClick={() => setReviewPage(reviewPage - 1)}
                  >
                    {t.back}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={reviewPage * 30 >= state.recipients.length}
                    onClick={() => setReviewPage(reviewPage + 1)}
                  >
                    {t.next}
                  </Button>
                </div>
              </details>
              {state.questionnaire && (
                <div className="space-y-2">
                  <h4 className="font-medium">{state.questionnaire.title}</h4>
                  <p className="text-sm text-muted-foreground">{t.namedPreview}</p>
                  <ol className="list-inside list-decimal space-y-2 text-sm">
                    {state.questionnaire.questions.map((question) => (
                      <li key={question.id}>
                        {question.prompt}
                        {question.required ? ' *' : ''}
                        {question.kind !== 'TEXT' && (
                          <ul className="ml-4 list-disc">
                            {question.options.map((option) => (
                              <li key={option.id}>{option.text}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          ) : (
            <>
              <Audience />
              <label className="block space-y-2 text-sm font-medium">
                {t.message}
                <Textarea
                  className="min-h-44 resize-y text-base"
                  rows={7}
                  placeholder={t.placeholder}
                  value={state.text}
                  maxLength={1000}
                  onChange={(event) => draft.change({ text: event.target.value })}
                />
              </label>
              <div className="-mt-3 text-right text-xs tabular-nums text-muted-foreground">
                {state.text.length} / 1000
              </div>
            </>
          )}
          <section className="space-y-3" aria-label={t.attachments}>
            {state.files.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {state.files.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 p-3">
                    {row.preview ? (
                      <img
                        src={row.preview}
                        alt=""
                        className="size-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <FileIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-medium">{row.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.file.size < 1048576
                          ? `${Math.max(1, Math.ceil(row.file.size / 1024))} KiB`
                          : `${(row.file.size / 1048576).toFixed(1)} MiB`}
                      </p>
                      {row.status === 'UPLOADING' && <LoadingState label={t.uploading} />}
                      {row.status === 'FAILED' && (
                        <>
                          <Feedback error={communicationError(row.error)} />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              draft.update({
                                files: draft.store
                                  .getState()
                                  .files.map((file) =>
                                    file.id === row.id ? { ...file, status: 'UPLOADING' } : file,
                                  ),
                              });
                              void uploadFile(row);
                            }}
                          >
                            <RefreshCwIcon />
                            {t.retry}
                          </Button>
                        </>
                      )}
                    </div>
                    <IconButton
                      icon={Trash2Icon}
                      label={t.remove}
                      tooltip={t.remove}
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        draft.removeFile(row.id);
                        if (row.status === 'READY') remove.mutate(row.attachment.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
            {state.phase !== 'REVIEW' && (
              <>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                  <PaperclipIcon className="size-4" />
                  {t.attach}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,application/pdf"
                    className="sr-only"
                    disabled={state.files.length >= 5 || locked}
                    onChange={(event) => {
                      const files = [...(event.target.files ?? [])];
                      if (files.length + draft.store.getState().files.length > 5) {
                        draft.update({ error: new Error(t.fileHint) });
                        event.target.value = '';
                        return;
                      }
                      for (const file of files) {
                        const row = draft.addFile(file);
                        if (row) void uploadFile(row);
                      }
                      event.target.value = '';
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">{t.fileHint}</p>
              </>
            )}
          </section>
          {state.phase !== 'REVIEW' && <QuestionnaireEditor />}
        </fieldset>
      </div>
      <footer className="shrink-0 space-y-3 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <Feedback error={communicationError(state.error ?? remove.error)} />
        {!online && (
          <p role="status" className="text-sm text-muted-foreground">
            {messages(currentLocale()).ui.common.waitingConnection}
          </p>
        )}
        {state.phase === 'SUBMITTING' && <LoadingState label={t.sending} />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm whitespace-nowrap tabular-nums text-muted-foreground">
            {format(t.selected, { count: state.recipients.length })}
          </span>
          <div className="ml-auto flex gap-2">
            {state.phase === 'REVIEW' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => draft.update({ phase: 'EDITING' })}
              >
                {t.back}
              </Button>
            )}
            <Button
              type="submit"
              className="min-h-11"
              disabled={!command || !online || state.phase === 'SUBMITTING'}
            >
              <SendIcon />
              {state.phase === 'UNCERTAIN'
                ? t.retry
                : state.recipients.length > 1 || state.questionnaire
                  ? state.phase === 'REVIEW'
                    ? state.recipients.length > 1
                      ? format(t.sendMany, { count: state.recipients.length })
                      : t.send
                    : t.review
                  : t.send}
            </Button>
          </div>
        </div>
      </footer>
    </form>
  );
}
