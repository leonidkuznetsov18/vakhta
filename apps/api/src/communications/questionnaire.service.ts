import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  authUser,
  communications,
  communicationRecipients,
  employees,
  eq,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  QuestionnaireDefinition,
  QuestionnaireAnswers,
  QuestionnaireView,
  validQuestionnaireAnswer,
  type SaveQuestionnaire,
} from '@vakhta/contracts';
import { DATABASE } from '../infra/database.module.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';

@Injectable()
export class QuestionnaireService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}
  async recipient(db: DbOrTx, id: string, telegramId: number) {
    const [row] = await db
      .select()
      .from(communicationRecipients)
      .innerJoin(
        telegramAccounts,
        eq(telegramAccounts.id, communicationRecipients.telegramAccountId),
      )
      .innerJoin(employees, eq(employees.id, communicationRecipients.employeeId))
      .where(
        and(
          eq(communicationRecipients.communicationId, id),
          eq(communicationRecipients.telegramUserId, telegramId),
          eq(telegramAccounts.telegramUserId, telegramId),
          eq(telegramAccounts.employeeId, communicationRecipients.employeeId),
          eq(telegramAccounts.status, 'ACTIVE'),
          eq(employees.status, 'ACTIVE'),
        ),
      )
      .for('share');
    if (!row) throw new DomainError('QUESTIONNAIRE_NOT_FOUND', 404, 'Questionnaire unavailable');
    return { ...row.communication_recipients, locale: row.employees.locale ?? 'ru' };
  }
  async read(id: string, telegramId: number, db: DbOrTx = this.db) {
    const recipient = await this.recipient(db, id, telegramId);
    const [row] = await db
      .select({ communication: communications, sender: authUser.name })
      .from(communications)
      .innerJoin(authUser, eq(authUser.id, communications.senderId))
      .where(eq(communications.id, id));
    if (!row?.communication.questionnaire)
      throw new DomainError('QUESTIONNAIRE_NOT_FOUND', 404, 'Questionnaire unavailable');
    return QuestionnaireView.parse({
      id,
      locale: recipient.locale,
      definition: QuestionnaireDefinition.parse(row.communication.questionnaire),
      introduction: row.communication.body,
      sender: row.sender,
      answers: QuestionnaireAnswers.parse(recipient.answers),
      version: recipient.responseVersion,
      questionIndex: recipient.questionIndex,
      closed: !!row.communication.closedAt,
      submittedAt: recipient.submittedAt?.toISOString() ?? null,
    });
  }
  async save(id: string, telegramId: number, command: SaveQuestionnaire) {
    return this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .select()
        .from(communications)
        .where(eq(communications.id, id))
        .for('update');
      const recipient = await this.recipient(tx, id, telegramId);
      if (!campaign?.questionnaire)
        throw new DomainError('QUESTIONNAIRE_NOT_FOUND', 404, 'Questionnaire unavailable');
      // Final response is immutable. A lost successful submission can be read back after closure.
      if (recipient.submittedAt) {
        if (command.submit && isDeepStrictEqual(recipient.answers, command.answers))
          return this.read(id, telegramId, tx);
        throw new DomainError(
          'QUESTIONNAIRE_VERSION_CONFLICT',
          409,
          'Submitted answers are immutable',
        );
      }
      if (campaign.closedAt)
        throw new DomainError('QUESTIONNAIRE_CLOSED', 409, 'Questionnaire is closed');
      if (recipient.responseVersion !== command.expectedVersion) {
        if (
          isDeepStrictEqual(recipient.answers, command.answers) &&
          recipient.questionIndex === command.questionIndex &&
          !command.submit
        )
          return this.read(id, telegramId, tx);
        throw new DomainError(
          'QUESTIONNAIRE_VERSION_CONFLICT',
          409,
          'Answers changed; reload the saved draft',
        );
      }
      const definition = QuestionnaireDefinition.parse(campaign.questionnaire);
      if (
        command.questionIndex > definition.questions.length ||
        Object.keys(command.answers).some(
          (key) => !definition.questions.some((question) => question.id === key),
        )
      )
        throw new DomainError('QUESTIONNAIRE_ANSWER_INVALID', 400, 'Invalid question');
      for (const question of definition.questions) {
        const answer = command.answers[question.id];
        if (
          !validQuestionnaireAnswer(
            { ...question, required: command.submit && question.required },
            answer,
          )
        )
          throw new DomainError(
            'QUESTIONNAIRE_ANSWER_INVALID',
            400,
            'Complete the required questions',
          );
      }
      const now = new Date();
      await tx
        .update(communicationRecipients)
        .set({
          answers: command.answers,
          questionIndex: command.questionIndex,
          responseVersion: recipient.responseVersion + 1,
          startedAt: recipient.startedAt ?? now,
          submittedAt: command.submit ? now : null,
        })
        .where(eq(communicationRecipients.id, recipient.id));
      if (command.submit)
        await this.audit.record(tx, {
          actor: { type: 'EMPLOYEE', id: recipient.employeeId, role: 'EMPLOYEE' },
          action: 'questionnaire.submit',
          objectType: 'communication',
          objectId: id,
        });
      return this.read(id, telegramId, tx);
    });
  }
}
