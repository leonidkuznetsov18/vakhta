import {
  QuestionnaireView,
  SaveQuestionnaire,
  type QuestionnaireAnswers,
  type QuestionnaireQuestion,
} from '@vakhta/contracts';
import { createStore } from 'zustand/vanilla';
import { apiFetch } from '@/api';
export const questionnaireApi = {
  async read(id: string, launch: string, signal?: AbortSignal) {
    return QuestionnaireView.parse(
      await apiFetch(`/questionnaires/${id}`, {
        headers: { authorization: `tma ${launch}` },
        credentials: 'omit',
        ...(signal ? { signal } : {}),
      }),
    );
  },
  async save(id: string, launch: string, command: SaveQuestionnaire) {
    return QuestionnaireView.parse(
      await apiFetch(`/questionnaires/${id}`, {
        method: 'POST',
        headers: { authorization: `tma ${launch}` },
        credentials: 'omit',
        body: JSON.stringify(SaveQuestionnaire.parse(command)),
      }),
    );
  },
};
export function createResponseDraft(view: QuestionnaireView) {
  const store = createStore<{
    answers: QuestionnaireAnswers;
    version: number;
    step: number;
    started: boolean;
    error: unknown;
  }>()(() => ({
    answers: view.answers,
    version: view.version,
    step: view.questionIndex,
    started: Object.keys(view.answers).length > 0,
    error: null,
  }));
  return {
    store,
    text(id: string, value: string) {
      store.setState({
        answers: { ...store.getState().answers, [id]: { kind: 'TEXT', text: value } },
        error: null,
      });
    },
    choose(question: QuestionnaireQuestion, id: string) {
      const answer = store.getState().answers[question.id];
      const selected = answer?.kind === 'CHOICE' ? answer.optionIds : [];
      const optionIds =
        question.kind === 'SINGLE_CHOICE'
          ? [id]
          : selected.includes(id)
            ? selected.filter((value) => value !== id)
            : [...selected, id];
      store.setState({
        answers: { ...store.getState().answers, [question.id]: { kind: 'CHOICE', optionIds } },
        error: null,
      });
    },
    saved(result: QuestionnaireView) {
      store.setState({
        answers: result.answers,
        version: result.version,
        step: result.questionIndex,
        error: null,
      });
    },
  };
}
