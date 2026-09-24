import { useState } from 'react';
import { useStore } from 'zustand';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import { validQuestionnaireAnswer, type QuestionnaireView } from '@vakhta/contracts';
import { CheckCircle2Icon, ArrowLeftIcon, ArrowRightIcon, ClipboardListIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { tenantConfig } from '@/shared/config/tenant';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { questionnaireApi, createResponseDraft } from '../model/response';
function errorText(error: unknown) {
  const t = messages(currentLocale()).communications;
  if (!error) return null;
  if (error instanceof ApiError)
    return Object.entries(t.errors).find(([key]) => key === error.code)?.[1] ?? t.error;
  return t.error;
}
export function QuestionnaireResponse({ id, launch }: { id: string; launch: string }) {
  const t = messages(currentLocale()).communications;
  const query = useQuery({
    queryKey: ['worker-questionnaire', id],
    queryFn: ({ signal }) => questionnaireApi.read(id, launch, signal),
    enabled: !!launch,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background [&_button]:min-h-11 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="mb-7 flex items-center gap-2 text-sm font-semibold">
        <ClipboardListIcon className="size-5" />
        {tenantConfig()?.displayName ?? messages(currentLocale()).admin.productName}
      </header>
      {!launch ? (
        <p role="status" className="text-base">
          {t.openTelegram}
        </p>
      ) : (
        <>
          <QueryFeedback query={query} errorMessage={errorText(query.error) ?? undefined} />
          {query.data && <ResponseForm key={id} view={query.data} launch={launch} />}
        </>
      )}
    </main>
  );
}
function ResponseForm({ view, launch }: { view: QuestionnaireView; launch: string }) {
  const t = messages(view.locale).communications;
  const [draft] = useState(() => createResponseDraft(view));
  const state = useStore(draft.store);
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(view.submittedAt);
  const save = useMutation({
    mutationFn: ({ step, submit }: { step: number; submit: boolean; pause?: boolean }) =>
      questionnaireApi.save(view.id, launch, {
        expectedVersion: draft.store.getState().version,
        answers: draft.store.getState().answers,
        questionIndex: step,
        submit,
      }),
    onSuccess: (result, input) => {
      draft.saved(result);
      if (input.pause) draft.store.setState({ started: false });
      setConfirmed(result.submittedAt);
      client.setQueryData(['worker-questionnaire', view.id], result);
    },
    onError: (error) => draft.store.setState({ error }),
  });
  const reload = useMutation({
    mutationFn: () => questionnaireApi.read(view.id, launch),
    onSuccess: (result) => {
      draft.saved(result);
      setConfirmed(result.submittedAt);
      client.setQueryData(['worker-questionnaire', view.id], result);
    },
  });
  const questions = view.definition.questions;
  const question = questions[state.step];
  const review = state.step >= questions.length;
  const answer = question ? state.answers[question.id] : undefined;
  const valid = question
    ? validQuestionnaireAnswer(question, answer)
    : questions.every((row) => validQuestionnaireAnswer(row, state.answers[row.id]));
  const stale =
    state.error instanceof ApiError && state.error.code === 'QUESTIONNAIRE_VERSION_CONFLICT';
  if (confirmed)
    return (
      <section className="space-y-4">
        <CheckCircle2Icon className="size-10 text-emerald-600" />
        <h1 className="text-2xl font-semibold">{t.submitted}</h1>
        <p className="text-muted-foreground">{view.definition.title}</p>
        <AnswerReview view={view} answers={state.answers} />
      </section>
    );
  if (view.closed)
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">{t.closed}</h1>
        <p className="text-muted-foreground">{view.definition.title}</p>
      </section>
    );
  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="space-y-3">
        <h1 className="break-words text-2xl leading-tight font-semibold">
          {view.definition.title}
        </h1>
        {view.introduction && (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {view.introduction}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {format(t.namedNotice, { sender: view.sender })}
        </p>
      </div>
      {!state.started ? (
        <Button
          className="min-h-12"
          onClick={() => {
            draft.store.setState({ started: true });
            save.mutate({ step: state.step, submit: false });
          }}
        >
          {Object.keys(state.answers).length ? t.continue : t.start}
          <ArrowRightIcon />
        </Button>
      ) : (
        <>
          <fieldset
            disabled={save.isPending || reload.isPending || stale}
            className="min-w-0 flex-1 space-y-5"
          >
            {review ? (
              <>
                <h2 className="text-lg font-medium">{t.reviewAnswers}</h2>
                <AnswerReview view={view} answers={state.answers} />
              </>
            ) : (
              question && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {format(t.progress, { current: state.step + 1, total: questions.length })}
                    </p>
                    <progress
                      className="h-1 w-full accent-primary"
                      max={questions.length}
                      value={state.step + 1}
                      aria-label={format(t.progress, {
                        current: state.step + 1,
                        total: questions.length,
                      })}
                    />
                  </div>
                  <label className="block break-words text-lg font-medium" htmlFor={question.id}>
                    {question.prompt}
                    {question.required && <span aria-label={t.required}> *</span>}
                  </label>
                  {question.kind === 'TEXT' ? (
                    <>
                      <Textarea
                        id={question.id}
                        value={answer?.kind === 'TEXT' ? answer.text : ''}
                        onChange={(event) => draft.text(question.id, event.target.value)}
                        rows={7}
                        maxLength={2000}
                        className="min-h-44 text-base"
                      />
                      <p className="text-right text-xs tabular-nums text-muted-foreground">
                        {answer?.kind === 'TEXT' ? answer.text.length : 0} / 2000
                      </p>
                    </>
                  ) : (
                    <div
                      role={question.kind === 'SINGLE_CHOICE' ? 'radiogroup' : 'group'}
                      aria-label={question.prompt}
                      className="space-y-2"
                    >
                      {question.options.map((option) => (
                        <label
                          key={option.id}
                          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                        >
                          <input
                            type={question.kind === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                            name={question.id}
                            checked={
                              answer?.kind === 'CHOICE' && answer.optionIds.includes(option.id)
                            }
                            onChange={() => draft.choose(question, option.id)}
                          />
                          <span className="min-w-0 break-words">{option.text}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </fieldset>
          <div className="sticky bottom-0 space-y-3 border-t bg-background py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending || reload.isPending || stale}
              onClick={() => save.mutate({ step: state.step, submit: false, pause: true })}
            >
              {t.saveDraft}
            </Button>
            <Feedback error={errorText(state.error ?? reload.error)} />
            {save.isPending && <LoadingState label={t.saving} />}
            {!!state.error && (
              <Button
                variant="outline"
                pending={reload.isPending}
                disabled={save.isPending}
                onClick={() => {
                  if (!reload.isPending && !save.isPending) reload.mutate();
                }}
              >
                {t.reloadDraft}
              </Button>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={save.isPending || reload.isPending || state.step === 0 || stale}
                onClick={() => save.mutate({ step: Math.max(0, state.step - 1), submit: false })}
              >
                <ArrowLeftIcon />
                {t.back}
              </Button>
              <Button
                className="min-h-12"
                disabled={save.isPending || reload.isPending || !valid || stale}
                onClick={() =>
                  save.mutate({ step: review ? questions.length : state.step + 1, submit: review })
                }
              >
                {review ? t.submitAnswers : t.next}
                <ArrowRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
function AnswerReview({
  view,
  answers,
}: {
  view: QuestionnaireView;
  answers: QuestionnaireView['answers'];
}) {
  const t = messages(view.locale).communications;
  return (
    <dl className="space-y-5">
      {view.definition.questions.map((question) => {
        const answer = answers[question.id];
        const value = !answer
          ? t.skippedQuestion
          : answer.kind === 'TEXT'
            ? answer.text || t.skippedQuestion
            : question.kind !== 'TEXT'
              ? question.options
                  .filter((option) => answer.optionIds.includes(option.id))
                  .map((option) => option.text)
                  .join(', ')
              : '';
        return (
          <div key={question.id}>
            <dt className="font-medium">{question.prompt}</dt>
            <dd className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
