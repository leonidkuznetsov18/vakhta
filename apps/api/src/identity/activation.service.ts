import { Inject, Injectable } from '@nestjs/common';
import { eq } from '@vakhta/db';
import {
  activationCodes,
  employees,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  activationDeepLinkParam,
  buildDeepLink,
  employeeAccess,
  evaluateActivationCode,
  normalizeActivationCode,
  type ActivationFailure,
} from '@vakhta/domain';
import { generateActivationCode, hashActivationCode } from '@vakhta/domain/node';
import type { ActivationCodeIssued } from '@vakhta/contracts';
import { resolveLocale } from '@vakhta/domain';
import { employeeActor, type Actor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { SHORT_TERM_STORE, type ShortTermStore } from '../infra/short-term-store.js';
import {
  EmployeesService,
  type EmployeePosition,
  type EmployeeRecord,
} from './employees.service.js';
import { IdentityError } from './identity.errors.js';

export interface ActivationOptions {
  readonly pepper: string;
  readonly ttlHours: number;
  /** Невдалих спроб на один Telegram-акаунт за годину (ТЗ 2.2: обмеження спроб). */
  readonly maxAttempts: number;
  /** Скільки живе показана картка до підтвердження. */
  readonly pendingTtlSeconds: number;
  readonly botUsername: string;
}

export const ACTIVATION_OPTIONS = Symbol('ACTIVATION_OPTIONS');

export type ActivationPreview =
  | {
      readonly ok: true;
      readonly employee: EmployeeRecord;
      readonly position: EmployeePosition | null;
    }
  | { readonly ok: false; readonly reason: ActivationFailure };

export type ActivationOutcome =
  | { readonly ok: true; readonly employee: EmployeeRecord; readonly alreadyLinked: boolean }
  | { readonly ok: false; readonly reason: ActivationFailure };

type CodeRecord = typeof activationCodes.$inferSelect;

type CodeCheck =
  | { readonly ok: true; readonly employee: EmployeeRecord; readonly code: CodeRecord }
  | { readonly ok: false; readonly reason: ActivationFailure };

const ATTEMPT_WINDOW_SECONDS = 3600;

/**
 * Активація в два кроки (ТЗ 2.2): показати масковану картку, потім привʼязати.
 * Код зберігається лише хешем; спроби обмежені на Telegram-акаунт.
 */
@Injectable()
export class ActivationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SHORT_TERM_STORE) private readonly store: ShortTermStore,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly employees: EmployeesService,
    @Inject(ACTIVATION_OPTIONS) private readonly options: ActivationOptions,
  ) {}

  /** HR або адміністратор видає код; відповідь містить код один раз. */
  /** Codes for a whole team at once; employees that are not active are skipped silently. */
  async issueMany(employeeIds: readonly string[], actor: Actor): Promise<ActivationCodeIssued[]> {
    const issued: ActivationCodeIssued[] = [];
    for (const employeeId of new Set(employeeIds)) {
      try {
        issued.push(await this.issue(employeeId, actor));
      } catch (e) {
        if (e instanceof IdentityError && e.code === 'EMPLOYEE_NOT_ACTIVE') continue;
        throw e;
      }
    }
    return issued;
  }

  async issue(employeeId: string, actor: Actor): Promise<ActivationCodeIssued> {
    return this.db.transaction(async (tx) => {
      const employee = await this.employees.requireById(employeeId, tx);
      if (employee.status !== 'ACTIVE') {
        throw new IdentityError('EMPLOYEE_NOT_ACTIVE', 'Код видається лише активному працівнику');
      }
      const code = generateActivationCode();
      const expiresAt = new Date(Date.now() + this.options.ttlHours * 3_600_000);
      await tx.insert(activationCodes).values({
        employeeId,
        codeHash: hashActivationCode(code, this.options.pepper),
        expiresAt,
        maxAttempts: this.options.maxAttempts,
        createdBy: actor.id,
      });
      await this.events.append(tx, {
        type: 'ACTIVATION_CODE_ISSUED',
        source: 'WEB',
        actor,
        employeeId,
        payload: { expiresAt: expiresAt.toISOString() },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.activation.issue',
        objectType: 'employee',
        objectId: employeeId,
        after: { expiresAt: expiresAt.toISOString() },
      });
      return {
        employeeId,
        code,
        deepLink: buildDeepLink(this.options.botUsername, activationDeepLinkParam(code)),
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  /** Крок 1: перевірити код і показати масковану картку, нічого не змінюючи. */
  async preview(telegramUserId: number, rawCode: string): Promise<ActivationPreview> {
    const attempts = await this.store.incr(
      this.attemptsKey(telegramUserId),
      ATTEMPT_WINDOW_SECONDS,
    );
    if (attempts > this.options.maxAttempts) return { ok: false, reason: 'ATTEMPTS_EXCEEDED' };

    const code = normalizeActivationCode(rawCode);
    if (!code) return { ok: false, reason: 'INVALID_CODE' };
    const codeHash = hashActivationCode(code, this.options.pepper);

    const check = await this.checkCode(this.db, telegramUserId, codeHash, false);
    if (!check.ok) return check;

    await this.store.set(
      this.pendingKey(telegramUserId),
      JSON.stringify({ codeHash }),
      this.options.pendingTtlSeconds,
    );
    const position = await this.employees.currentPosition(check.employee.id);
    return { ok: true, employee: check.employee, position };
  }

  /** Крок 2: працівник підтвердив, що картка його. */
  async confirm(telegramUserId: number, languageCode?: string): Promise<ActivationOutcome> {
    const pending = await this.store.get(this.pendingKey(telegramUserId));
    if (!pending) return { ok: false, reason: 'NO_PENDING' };
    const { codeHash } = JSON.parse(pending) as { codeHash: string };

    const outcome = await this.activateByHash(telegramUserId, codeHash, languageCode);
    await this.store.del(this.pendingKey(telegramUserId));
    if (outcome.ok) await this.store.del(this.attemptsKey(telegramUserId));
    return outcome;
  }

  async cancel(telegramUserId: number): Promise<void> {
    await this.store.del(this.pendingKey(telegramUserId));
  }

  private async activateByHash(
    telegramUserId: number,
    codeHash: string,
    languageCode?: string,
  ): Promise<ActivationOutcome> {
    return this.db.transaction(async (tx) => {
      const check = await this.checkCode(tx, telegramUserId, codeHash, true);
      if (!check.ok) return check;
      const { employee, code } = check;
      const now = new Date();

      const sameLink = await this.employees.activeLinkByTelegramUser(telegramUserId, tx);
      if (sameLink && sameLink.employeeId === employee.id) {
        await tx
          .update(activationCodes)
          .set({ usedAt: now })
          .where(eq(activationCodes.id, code.id));
        return { ok: true, employee, alreadyLinked: true };
      }

      await tx
        .insert(telegramAccounts)
        .values({ employeeId: employee.id, telegramUserId, status: 'ACTIVE' });
      await tx.update(activationCodes).set({ usedAt: now }).where(eq(activationCodes.id, code.id));
      // First link: the Telegram client language becomes the bot language until the employee changes it.
      if (!employee.locale) {
        await tx
          .update(employees)
          .set({ locale: resolveLocale(languageCode), updatedAt: now })
          .where(eq(employees.id, employee.id));
      }

      const actor = employeeActor(employee.id);
      await this.events.append(tx, {
        type: 'TELEGRAM_LINKED',
        source: 'TELEGRAM',
        actor,
        employeeId: employee.id,
        payload: { telegramUserId, via: 'ACTIVATION_CODE' },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.telegram.link',
        objectType: 'employee',
        objectId: employee.id,
        after: { telegramUserId },
      });
      return { ok: true, employee, alreadyLinked: false };
    });
  }

  /** Спільні перевірки для preview і confirm: код, працівник, конфлікти привʼязок. */
  private async checkCode(
    tx: DbOrTx,
    telegramUserId: number,
    codeHash: string,
    lock: boolean,
  ): Promise<CodeCheck> {
    const query = tx
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.codeHash, codeHash))
      .limit(1);
    const [code] = lock ? await query.for('update') : await query;
    if (!code) return { ok: false, reason: 'INVALID_CODE' };

    const verdict = evaluateActivationCode(code, new Date());
    if (verdict === 'USED') return { ok: false, reason: 'CODE_USED' };
    if (verdict === 'EXPIRED') return { ok: false, reason: 'CODE_EXPIRED' };
    if (verdict === 'ATTEMPTS_EXCEEDED') return { ok: false, reason: 'ATTEMPTS_EXCEEDED' };

    const [employee] = await tx
      .select()
      .from(employees)
      .where(eq(employees.id, code.employeeId))
      .limit(1);
    const access = employeeAccess(employee?.status);
    if (!employee || access === 'NOT_REGISTERED') return { ok: false, reason: 'INVALID_CODE' };
    if (access === 'BLOCKED') return { ok: false, reason: 'EMPLOYEE_BLOCKED' };
    if (access === 'TERMINATED') return { ok: false, reason: 'EMPLOYEE_TERMINATED' };

    const takenBy = await this.employees.activeLinkByTelegramUser(telegramUserId, tx);
    if (takenBy && takenBy.employeeId !== employee.id) {
      return { ok: false, reason: 'TELEGRAM_ALREADY_LINKED' };
    }
    const existing = await this.employees.activeLinkByEmployee(employee.id, tx);
    if (existing && existing.telegramUserId !== telegramUserId) {
      return { ok: false, reason: 'EMPLOYEE_ALREADY_LINKED' };
    }
    return { ok: true, employee, code };
  }

  private attemptsKey(telegramUserId: number): string {
    return `activation:attempts:${telegramUserId}`;
  }

  private pendingKey(telegramUserId: number): string {
    return `activation:pending:${telegramUserId}`;
  }
}
