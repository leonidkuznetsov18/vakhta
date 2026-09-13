import { describe, expect, it } from 'vitest';
import {
  CreateCommunication,
  QuestionnaireDefinition,
  validQuestionnaireAnswer,
} from './communications.js';
const id = 'b0745b42-1670-4233-8b87-ea284f8c3845';
const command = {
  requestId: id,
  recipientIds: [id],
  text: 'Message',
  attachmentIds: [],
  questionnaire: null,
};
describe('communication boundaries', () => {
  it('rejects duplicate recipients and an empty message', () => {
    expect(CreateCommunication.safeParse({ ...command, recipientIds: [id, id] }).success).toBe(
      false,
    );
    expect(CreateCommunication.safeParse({ ...command, text: '  ' }).success).toBe(false);
    expect(
      CreateCommunication.safeParse({ ...command, text: '', attachmentIds: [id] }).success,
    ).toBe(true);
  });
  it('supports multiple free-text questions but rejects duplicate question identities', () => {
    const question = { id, kind: 'TEXT', prompt: 'What needs improving?', required: true };
    expect(
      QuestionnaireDefinition.safeParse({ title: 'Feedback', questions: [question] }).success,
    ).toBe(true);
    expect(
      QuestionnaireDefinition.safeParse({ title: 'Feedback', questions: [question, question] })
        .success,
    ).toBe(false);
  });
  it('validates required answers, choice membership and single-choice cardinality', () => {
    expect(
      validQuestionnaireAnswer(
        { id, kind: 'TEXT', prompt: 'Why?', required: true },
        { kind: 'TEXT', text: '  ' },
      ),
    ).toBe(false);
    expect(
      validQuestionnaireAnswer({ id, kind: 'TEXT', prompt: 'Why?', required: false }, undefined),
    ).toBe(true);
    expect(
      validQuestionnaireAnswer(
        {
          id,
          kind: 'SINGLE_CHOICE',
          prompt: 'Which?',
          required: true,
          options: [{ id, text: 'A' }],
        },
        { kind: 'CHOICE', optionIds: ['9f72f3fb-77bd-4d75-8dce-6f8485b7cbbb'] },
      ),
    ).toBe(false);
  });
});
