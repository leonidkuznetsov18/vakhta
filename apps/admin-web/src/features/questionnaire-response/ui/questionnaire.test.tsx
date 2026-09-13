import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { QuestionnaireView } from '@vakhta/contracts';
import { render } from '@/test-utils';
import { QuestionnaireResponse } from './questionnaire';
import { questionnaireApi } from '../model/response';
const t = messages('ru').communications;
const id = 'b0000000-0000-4000-8000-000000000001',
  questionId = 'b0000000-0000-4000-8000-000000000002';
const view = QuestionnaireView.parse({
  id,
  locale: 'ru',
  definition: {
    title: 'Shift feedback',
    questions: [{ id: questionId, kind: 'TEXT', prompt: 'What should improve?', required: true }],
  },
  introduction: '',
  sender: 'Test coordinator',
  answers: { [questionId]: { kind: 'TEXT', text: 'Saved response' } },
  version: 1,
  questionIndex: 0,
  closed: false,
  submittedAt: null,
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('locks answers while explicitly reloading a saved draft after a failure', async () => {
  let resolve: (value: QuestionnaireView) => void = () => {
    throw new Error('Reload not started');
  };
  vi.spyOn(questionnaireApi, 'read')
    .mockResolvedValueOnce(view)
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
  vi.spyOn(questionnaireApi, 'save').mockRejectedValue(new Error('Lost connection'));
  render(<QuestionnaireResponse id={id} launch="synthetic" />);
  const input = await screen.findByLabelText(/What should improve/);
  fireEvent.change(input, { target: { value: 'New answer' } });
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  await screen.findByRole('button', { name: t.reloadDraft });
  fireEvent.click(screen.getByRole('button', { name: t.reloadDraft }));
  await waitFor(() => expect(input.matches(':disabled')).toBe(true));
  expect(screen.getByRole('button', { name: t.next }).matches(':disabled')).toBe(true);
  resolve(view);
  await waitFor(() => expect(input.matches(':disabled')).toBe(false));
  expect(input instanceof HTMLTextAreaElement && input.value).toBe('Saved response');
});
it('renders submitted questionnaires as read-only evidence', async () => {
  vi.spyOn(questionnaireApi, 'read').mockResolvedValue({
    ...view,
    submittedAt: new Date().toISOString(),
  });
  render(<QuestionnaireResponse id={id} launch="synthetic" />);
  await screen.findByText(t.submitted);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('Saved response')).toBeTruthy();
});
it('prevents reload from overlapping a save retry', async () => {
  vi.spyOn(questionnaireApi, 'read').mockResolvedValue(view);
  let finish: (value: QuestionnaireView) => void = () => {
    throw new Error('Save not started');
  };
  vi.spyOn(questionnaireApi, 'save')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(<QuestionnaireResponse id={id} launch="synthetic" />);
  await screen.findByLabelText(/What should improve/);
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  await screen.findByRole('button', { name: t.reloadDraft });
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.reloadDraft }).matches(':disabled')).toBe(true),
  );
  finish({ ...view, version: 2, questionIndex: 1 });
  await screen.findByText(t.reviewAnswers);
});
