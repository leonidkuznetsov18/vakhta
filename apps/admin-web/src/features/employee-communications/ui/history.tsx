import { useState } from 'react';
import { useStore } from 'zustand';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  FileIcon,
} from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { TableCount } from '@/components/app/data-table';
import { communicationApi, communicationKey } from '../api/communications';
import { useCommunicationDraft } from '../model/context';
import { choiceResults } from '../model/results';
import { communicationError } from '../model/feedback';
import type { CommunicationDetail } from '@vakhta/contracts';
const tones = {
  PENDING: 'text-slate-600 dark:text-slate-300',
  SENDING: 'text-blue-700 dark:text-blue-300',
  SENT: 'text-emerald-700 dark:text-emerald-300',
  FAILED: 'text-red-700 dark:text-red-300',
  SKIPPED: 'text-violet-700 dark:text-violet-300',
  UNKNOWN: 'text-orange-700 dark:text-orange-300',
};
export function CommunicationHistory() {
  const t = messages(currentLocale()).communications;
  const draft = useCommunicationDraft();
  const detailId = useStore(draft.store, (state) => state.detailId);
  const { actorId } = useNavigation();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...communicationKey(actorId ?? ''), 'history', page],
    queryFn: ({ signal }) => communicationApi.history(page, signal),
    enabled: !detailId,
    refetchInterval: 10_000,
  });
  const detail = useQuery({
    queryKey: [...communicationKey(actorId ?? ''), 'detail', detailId],
    queryFn: ({ signal }) => communicationApi.detail(detailId ?? '', signal),
    enabled: !!detailId,
    refetchInterval: 5000,
  });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
      {detailId ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className="mb-4"
            onClick={() => draft.update({ detailId: null })}
          >
            <ArrowLeftIcon />
            {t.history}
          </Button>
          <QueryFeedback
            query={detail}
            errorMessage={communicationError(detail.error) ?? undefined}
          />
          {detail.data && <DeliveryDetail detail={detail.data} />}
        </>
      ) : (
        <>
          <QueryFeedback query={list} errorMessage={communicationError(list.error) ?? undefined} />
          {list.data?.items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t.emptyHistory}</p>
          )}
          <ul className="divide-y">
            {list.data?.items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full space-y-2 rounded-lg px-2 py-4 text-left hover:bg-accent active:bg-accent/80 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => draft.update({ detailId: row.id })}
                >
                  <span className="block truncate font-medium">
                    {row.title ?? (row.text.slice(0, 100) || t.attachments)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString(currentLocale())}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {format(t.deliverySummary, {
                      sent: row.sentCount,
                      total: row.recipientCount,
                      failed: row.failedCount,
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.data && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <TableCount
                total={list.data.total}
                from={list.data.total ? (page - 1) * 10 + 1 : 0}
                to={Math.min(page * 10, list.data.total)}
              />
              <div className="flex gap-1">
                <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t.back}
                </Button>
                <Button
                  variant="ghost"
                  disabled={page * 10 >= list.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  {t.next}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function DeliveryDetail({ detail }: { detail: CommunicationDetail }) {
  const t = messages(currentLocale()).communications;
  const client = useQueryClient();
  const { actorId } = useNavigation();
  const [recipientPage, setRecipientPage] = useState(1);
  const [retryId, setRetryId] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: communicationKey(actorId ?? '') });
  const close = useMutation({
    mutationFn: () => communicationApi.close(detail.id),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (id: string) => communicationApi.retry(detail.id, id),
    onSuccess: () => {
      setRetryId(null);
      void refresh();
    },
  });
  const link = useMutation({
    mutationFn: ({ id }: { id: string; target: Window | null }) => communicationApi.link(id),
    onSuccess: ({ url }, { target }) => {
      if (target) target.location.replace(url);
      else window.location.assign(url);
    },
    onError: (_error, { target }) => target?.close(),
  });
  const statusLabel = {
    PENDING: t.pending,
    SENDING: t.sending,
    SENT: t.sent,
    FAILED: t.failed,
    SKIPPED: t.skipped,
    UNKNOWN: t.unknown,
  };
  return (
    <article className="space-y-5">
      <div className="space-y-2">
        <h3 className="break-words text-lg font-semibold">{detail.title ?? t.message}</h3>
        <p className="text-sm text-muted-foreground">
          {format(t.sender, { name: detail.senderName })}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(detail.createdAt).toLocaleString(currentLocale())}
        </p>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">
          {detail.text}
        </p>
      </div>
      {detail.attachments.length > 0 && (
        <ul className="space-y-2">
          {detail.attachments.map((file) => (
            <li key={file.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal break-all text-left"
                pending={link.isPending && link.variables.id === file.id}
                onClick={() => {
                  const target = window.open('about:blank', '_blank');
                  if (target) target.opener = null;
                  link.mutate({ id: file.id, target });
                }}
              >
                <FileIcon className="shrink-0" />
                {file.filename}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1 text-sm">
        <p>
          {format(t.deliverySummary, {
            sent: detail.sentCount,
            total: detail.recipientCount,
            failed: detail.failedCount,
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t.readNotice}</p>
      </div>
      {detail.questionnaire && (
        <div className="space-y-3 border-t pt-4">
          <h4 className="font-medium">{t.results}</h4>
          <p className="text-sm">
            {format(t.responseSummary, {
              started: detail.startedCount,
              submitted: detail.submittedCount,
              total: detail.recipientCount,
            })}
          </p>
          {choiceResults(detail).map((question) => (
            <section key={question.id} className="space-y-2 rounded-lg border p-3">
              <h5 className="break-words text-sm font-medium">{question.prompt}</h5>
              {question.multiple && (
                <p className="text-xs text-muted-foreground">{t.multipleNotice}</p>
              )}
              <ul className="space-y-2">
                {question.options.map((option) => (
                  <li key={option.id} className="text-sm">
                    <span className="block break-words">{option.text}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {format(t.optionSummary, {
                        count: option.count,
                        total: question.total,
                        percent: option.percent,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {detail.closedAt ? (
            <p className="text-sm text-muted-foreground">{t.closed}</p>
          ) : (
            <Button variant="outline" pending={close.isPending} onClick={() => close.mutate()}>
              {t.closeQuestionnaire}
            </Button>
          )}
        </div>
      )}
      <Feedback error={communicationError(close.error ?? retry.error ?? link.error)} />
      {retryId && (
        <Alert variant="warning">
          <AlertCircleIcon />
          <AlertTitle>{t.retryWarning}</AlertTitle>
          <div className="col-start-2 mt-2 flex gap-2">
            <Button size="sm" pending={retry.isPending} onClick={() => retry.mutate(retryId)}>
              {t.confirmRetry}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRetryId(null)}>
              {t.cancel}
            </Button>
          </div>
        </Alert>
      )}
      <ul className="divide-y border-t">
        {detail.recipients.slice((recipientPage - 1) * 20, recipientPage * 20).map((person) => (
          <li key={person.employeeId} className="py-3">
            <details>
              <summary className="cursor-pointer rounded-lg py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                {person.fullName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {person.submittedAt ? t.submitted : person.startedAt ? t.draftResponse : ''}
                </span>
              </summary>
              <div className="mt-2 space-y-3">
                {person.parts.map((part) => (
                  <div key={part.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={`flex items-center gap-2 ${tones[part.status]}`}>
                      {part.status === 'SENT' ? (
                        <CheckCircle2Icon className="size-4" />
                      ) : part.status === 'PENDING' || part.status === 'SENDING' ? (
                        <ClockIcon className="size-4" />
                      ) : (
                        <AlertCircleIcon className="size-4" />
                      )}
                      {part.ordinal + 1} · {statusLabel[part.status]}
                    </span>
                    {['FAILED', 'UNKNOWN'].includes(part.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retry.isPending}
                        pending={retry.isPending && retry.variables === part.id}
                        onClick={() =>
                          part.status === 'UNKNOWN' ? setRetryId(part.id) : retry.mutate(part.id)
                        }
                      >
                        {t.retry}
                      </Button>
                    )}
                  </div>
                ))}
                {detail.questionnaire?.questions.map((question) => {
                  const answer = person.answers[question.id];
                  const value = !answer
                    ? question.required
                      ? t.notAnswered
                      : t.skippedQuestion
                    : answer.kind === 'TEXT'
                      ? answer.text
                      : question.kind !== 'TEXT'
                        ? question.options
                            .filter((option) => answer.optionIds.includes(option.id))
                            .map((option) => option.text)
                            .join(', ')
                        : '';
                  return (
                    <div key={question.id} className="border-t pt-2 text-sm">
                      <p className="font-medium">{question.prompt}</p>
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
                        {value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <TableCount
          total={detail.recipients.length}
          from={detail.recipients.length ? (recipientPage - 1) * 20 + 1 : 0}
          to={Math.min(recipientPage * 20, detail.recipients.length)}
        />
        <div className="flex gap-1">
          <Button
            variant="ghost"
            disabled={recipientPage <= 1}
            onClick={() => setRecipientPage(recipientPage - 1)}
          >
            {t.back}
          </Button>
          <Button
            variant="ghost"
            disabled={recipientPage * 20 >= detail.recipients.length}
            onClick={() => setRecipientPage(recipientPage + 1)}
          >
            {t.next}
          </Button>
        </div>
      </div>
    </article>
  );
}
