import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

export const COMMUNICATION_LIMITS = {
  recipients: 500,
  attachments: 5,
  attachmentBytes: 10 * 1024 * 1024,
  text: 1000,
  questions: 10,
  answer: 2000,
} as const;

const QuestionBase = z.object({
  id: Uuid,
  prompt: z.string().trim().min(1).max(300),
  required: z.boolean(),
});
const ChoiceOptions = z
  .array(z.object({ id: Uuid, text: z.string().trim().min(1).max(100) }))
  .min(2)
  .max(10)
  .refine((options) => new Set(options.map((option) => option.id)).size === options.length)
  .refine(
    (options) =>
      new Set(options.map((option) => option.text.toLocaleLowerCase())).size === options.length,
  );
export const QuestionnaireQuestion = z.discriminatedUnion('kind', [
  QuestionBase.extend({ kind: z.literal('TEXT') }),
  QuestionBase.extend({ kind: z.literal('SINGLE_CHOICE'), options: ChoiceOptions }),
  QuestionBase.extend({ kind: z.literal('MULTIPLE_CHOICE'), options: ChoiceOptions }),
]);
export type QuestionnaireQuestion = z.infer<typeof QuestionnaireQuestion>;
export const QuestionnaireDefinition = z.object({
  title: z.string().trim().min(1).max(200),
  questions: z
    .array(QuestionnaireQuestion)
    .min(1)
    .max(COMMUNICATION_LIMITS.questions)
    .refine(
      (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
    ),
});
export type QuestionnaireDefinition = z.infer<typeof QuestionnaireDefinition>;
export const QuestionnaireAnswer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('TEXT'), text: z.string().trim().max(COMMUNICATION_LIMITS.answer) }),
  z.object({
    kind: z.literal('CHOICE'),
    optionIds: z
      .array(Uuid)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);
export type QuestionnaireAnswer = z.infer<typeof QuestionnaireAnswer>;
export const QuestionnaireAnswers = z.record(Uuid, QuestionnaireAnswer);
export type QuestionnaireAnswers = z.infer<typeof QuestionnaireAnswers>;

export function validQuestionnaireAnswer(
  question: QuestionnaireQuestion,
  answer: QuestionnaireAnswer | undefined,
): boolean {
  if (!answer) return !question.required;
  if (question.kind === 'TEXT')
    return answer.kind === 'TEXT' && (!question.required || answer.text.trim().length > 0);
  if (answer.kind !== 'CHOICE') return false;
  if (question.required && answer.optionIds.length === 0) return false;
  if (question.kind === 'SINGLE_CHOICE' && answer.optionIds.length > 1) return false;
  return answer.optionIds.every((id) => question.options.some((option) => option.id === id));
}

export const CreateCommunication = z
  .object({
    requestId: Uuid,
    recipientIds: z
      .array(Uuid)
      .min(1)
      .max(COMMUNICATION_LIMITS.recipients)
      .refine((ids) => new Set(ids).size === ids.length),
    text: z.string().trim().max(COMMUNICATION_LIMITS.text),
    attachmentIds: z
      .array(Uuid)
      .max(COMMUNICATION_LIMITS.attachments)
      .refine((ids) => new Set(ids).size === ids.length),
    questionnaire: QuestionnaireDefinition.nullable(),
  })
  .refine(
    (command) =>
      command.text.length >= 3 ||
      command.attachmentIds.length > 0 ||
      command.questionnaire !== null,
  );
export type CreateCommunication = z.infer<typeof CreateCommunication>;

export const CommunicationAudienceQuery = z.object({
  search: z.string().trim().max(200).default(''),
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
  teamId: Uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type CommunicationAudienceQuery = z.infer<typeof CommunicationAudienceQuery>;
export const CommunicationRecipient = z.object({
  id: Uuid,
  fullName: z.string(),
  personnelNumber: z.string(),
  eligible: z.boolean(),
  reason: z.enum(['INACTIVE', 'UNLINKED']).nullable(),
  unitName: z.string().nullable(),
});
export type CommunicationRecipient = z.infer<typeof CommunicationRecipient>;
export const CommunicationAudience = z.object({
  items: z.array(CommunicationRecipient),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
});
export const CommunicationAudienceIds = z.object({
  ids: z.array(Uuid).max(COMMUNICATION_LIMITS.recipients),
});
export const CommunicationAttachment = z.object({
  id: Uuid,
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
});
export type CommunicationAttachment = z.infer<typeof CommunicationAttachment>;
export const CommunicationDeliveryStatus = z.enum([
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
  'UNKNOWN',
]);
export const CommunicationSummary = z.object({
  senderName: z.string(),
  id: Uuid,
  text: z.string(),
  title: z.string().nullable(),
  createdAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
  recipientCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  startedCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
});
export type CommunicationSummary = z.infer<typeof CommunicationSummary>;
export const CommunicationHistory = z.object({
  items: z.array(CommunicationSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
});
export const CommunicationDetail = CommunicationSummary.extend({
  questionnaire: QuestionnaireDefinition.nullable(),
  attachments: z.array(CommunicationAttachment),
  recipients: z.array(
    z.object({
      employeeId: Uuid,
      fullName: z.string(),
      parts: z.array(
        z.object({
          id: Uuid,
          ordinal: z.number().int().nonnegative(),
          status: CommunicationDeliveryStatus,
        }),
      ),
      answers: QuestionnaireAnswers,
      submittedAt: IsoDateTime.nullable(),
      startedAt: IsoDateTime.nullable(),
    }),
  ),
});
export type CommunicationDetail = z.infer<typeof CommunicationDetail>;

export const QuestionnaireView = z.object({
  locale: z.enum(['uk', 'en', 'ru']),
  id: Uuid,
  definition: QuestionnaireDefinition,
  introduction: z.string(),
  sender: z.string(),
  answers: QuestionnaireAnswers,
  version: z.number().int().nonnegative(),
  questionIndex: z.number().int().nonnegative(),
  closed: z.boolean(),
  submittedAt: IsoDateTime.nullable(),
});
export type QuestionnaireView = z.infer<typeof QuestionnaireView>;
export const SaveQuestionnaire = z.object({
  expectedVersion: z.number().int().nonnegative(),
  answers: QuestionnaireAnswers,
  questionIndex: z.number().int().min(0).max(COMMUNICATION_LIMITS.questions),
  submit: z.boolean(),
});
export type SaveQuestionnaire = z.infer<typeof SaveQuestionnaire>;
