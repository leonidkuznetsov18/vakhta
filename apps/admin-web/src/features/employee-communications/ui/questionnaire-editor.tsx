import { messages } from '@vakhta/i18n';
import { useStore } from 'zustand';
import { ListPlusIcon, Trash2Icon } from 'lucide-react';
import { QuestionnaireDefinition, type QuestionnaireQuestion } from '@vakhta/contracts';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Feedback } from '@/components/app/feedback';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconButton } from '@/shared/ui/icon-button';
import { useCommunicationDraft } from '../model/context';
import { newQuestion } from '../model/draft';
export function QuestionnaireEditor() {
  const t = messages(currentLocale()).communications;
  const draft = useCommunicationDraft();
  const questionnaire = useStore(draft.store, (state) => state.questionnaire);
  if (!questionnaire)
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => draft.change({ questionnaire: { title: '', questions: [newQuestion()] } })}
      >
        <ListPlusIcon />
        {t.addQuestionnaire}
      </Button>
    );
  function updateQuestion(
    id: string,
    change: (question: QuestionnaireQuestion) => QuestionnaireQuestion,
  ) {
    if (questionnaire)
      draft.change({
        questionnaire: {
          ...questionnaire,
          questions: questionnaire.questions.map((question) =>
            question.id === id ? change(question) : question,
          ),
        },
      });
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-label={t.questionnaire}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t.questionnaire}</h3>
        <IconButton
          icon={Trash2Icon}
          label={t.removeQuestionnaire}
          tooltip={t.removeQuestionnaire}
          size="icon"
          variant="ghost"
          onClick={() => draft.change({ questionnaire: null })}
        />
      </div>
      <label className="block space-y-1 text-sm font-medium">
        {t.questionnaireTitle}
        <Input
          value={questionnaire.title}
          maxLength={200}
          onChange={(event) =>
            draft.change({ questionnaire: { ...questionnaire, title: event.target.value } })
          }
        />
      </label>
      {questionnaire.questions.map((question, index) => (
        <div key={question.id} className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t.question} {index + 1}
            </span>
            <IconButton
              icon={Trash2Icon}
              label={t.remove}
              tooltip={t.remove}
              size="icon"
              variant="ghost"
              disabled={questionnaire.questions.length <= 1}
              onClick={() =>
                draft.change({
                  questionnaire: {
                    ...questionnaire,
                    questions: questionnaire.questions.filter((row) => row.id !== question.id),
                  },
                })
              }
            />
          </div>
          <Textarea
            aria-label={`${t.question} ${index + 1}`}
            value={question.prompt}
            maxLength={300}
            rows={2}
            onChange={(event) =>
              updateQuestion(question.id, (row) => ({ ...row, prompt: event.target.value }))
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              aria-label={`${t.question} ${index + 1}`}
              value={question.kind}
              className="min-h-11 rounded-md border bg-background px-3 text-sm"
              onChange={(event) => {
                const kind = event.target.value;
                updateQuestion(question.id, (row) =>
                  kind === 'TEXT'
                    ? { id: row.id, prompt: row.prompt, required: row.required, kind: 'TEXT' }
                    : {
                        id: row.id,
                        prompt: row.prompt,
                        required: row.required,
                        kind: kind === 'SINGLE_CHOICE' ? 'SINGLE_CHOICE' : 'MULTIPLE_CHOICE',
                        options:
                          row.kind === 'TEXT'
                            ? [
                                { id: crypto.randomUUID(), text: '' },
                                { id: crypto.randomUUID(), text: '' },
                              ]
                            : row.options,
                      },
                );
              }}
            >
              <option value="TEXT">{t.textQuestion}</option>
              <option value="SINGLE_CHOICE">{t.singleQuestion}</option>
              <option value="MULTIPLE_CHOICE">{t.multipleQuestion}</option>
            </select>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) =>
                  updateQuestion(question.id, (row) => ({ ...row, required: event.target.checked }))
                }
              />
              {t.required}
            </label>
          </div>
          {question.kind !== 'TEXT' && (
            <label className="block space-y-1 text-sm">
              {t.options}
              <Textarea
                rows={3}
                value={question.options.map((option) => option.text).join('\n')}
                onChange={(event) =>
                  updateQuestion(question.id, (row) =>
                    row.kind === 'TEXT'
                      ? row
                      : {
                          ...row,
                          options: event.target.value
                            .split('\n')
                            .slice(0, 10)
                            .map((text, i) => ({
                              id: row.options[i]?.id ?? crypto.randomUUID(),
                              text: text.slice(0, 100),
                            })),
                        },
                  )
                }
              />
            </label>
          )}
        </div>
      ))}
      <Feedback
        error={
          QuestionnaireDefinition.safeParse(questionnaire).success
            ? null
            : t.questionnaireIncomplete
        }
      />
      <Button
        type="button"
        variant="outline"
        disabled={questionnaire.questions.length >= 10}
        onClick={() =>
          draft.change({
            questionnaire: {
              ...questionnaire,
              questions: [...questionnaire.questions, newQuestion()],
            },
          })
        }
      >
        <ListPlusIcon />
        {t.addQuestion}
      </Button>
    </section>
  );
}
