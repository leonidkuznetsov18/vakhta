import { expect, it } from 'vitest';
import { CommunicationDetail } from '@vakhta/contracts';
import { choiceResults } from './results';
const id = 'b0000000-0000-4000-8000-000000000001',
  option = 'b0000000-0000-4000-8000-000000000002',
  question = 'b0000000-0000-4000-8000-000000000003',
  other = 'b0000000-0000-4000-8000-000000000004';
it('uses submitted respondents as the denominator and excludes partial drafts', () => {
  const person = {
    employeeId: id,
    fullName: 'Synthetic',
    parts: [],
    answers: { [question]: { kind: 'CHOICE', optionIds: [option, other] } },
    startedAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
  };
  const detail = CommunicationDetail.parse({
    id,
    senderName: 'Sender',
    text: '',
    title: 'Feedback',
    createdAt: new Date().toISOString(),
    closedAt: null,
    recipientCount: 2,
    sentCount: 2,
    failedCount: 0,
    startedCount: 2,
    submittedCount: 1,
    attachments: [],
    questionnaire: {
      title: 'Feedback',
      questions: [
        {
          id: question,
          kind: 'MULTIPLE_CHOICE',
          prompt: 'Choose',
          required: true,
          options: [
            { id: option, text: 'One' },
            { id: other, text: 'Two' },
          ],
        },
      ],
    },
    recipients: [person, { ...person, employeeId: other, submittedAt: null }],
  });
  const [result] = choiceResults(detail);
  expect(result?.total).toBe(1);
  expect(result?.options.map((item) => item.percent)).toEqual([100, 100]);
});
