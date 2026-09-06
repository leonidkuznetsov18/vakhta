import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActivationChannel, ActivationDelivered } from '@vakhta/contracts';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { DateTime } from 'luxon';
import QRCode from 'qrcode';
import type { Env } from '../config/env.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import type { Database } from '@vakhta/db';
import type { Actor } from '../common/actor.js';
import { DATABASE } from '../infra/database.module.js';
import { ActivationService } from '../identity/activation.service.js';
import { EmployeesService } from '../identity/employees.service.js';
import { TelegramContactsService } from '../identity/telegram-contacts.service.js';
import { MAIL_SENDER, type MailSender } from './mail.js';
import { activationHtml, activationText } from './activation-card.js';

/** The part of the Telegram bot the delivery needs: one photo with a caption and a button. */
export interface ActivationTelegramSender {
  readonly enabled: boolean;
  sendActivationCard(
    chatId: number,
    card: {
      readonly png: Buffer;
      readonly caption: string;
      readonly button: string;
      readonly url: string;
    },
  ): Promise<void>;
}
export const ACTIVATION_TELEGRAM_SENDER = Symbol('ACTIVATION_TELEGRAM_SENDER');

function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const shown = user.length <= 2 ? user : `${user.slice(0, 2)}…`;
  return `${shown}@${domain}`;
}

/**
 * Sends the activation card (code, deep link, QR) where HR chose: to the employee's e-mail or to
 * their Telegram chat with the bot. Every send issues a fresh code, so the previous one dies.
 */
@Injectable()
export class ActivationDeliveryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly employees: EmployeesService,
    private readonly activation: ActivationService,
    private readonly contacts: TelegramContactsService,
    private readonly audit: AuditLog,
    @Optional() @Inject(MAIL_SENDER) private readonly mail: MailSender | null = null,
    @Optional()
    @Inject(ACTIVATION_TELEGRAM_SENDER)
    private readonly telegram: ActivationTelegramSender | null = null,
  ) {}

  get mailEnabled(): boolean {
    return this.mail !== null;
  }

  async send(
    employeeId: string,
    channel: ActivationChannel,
    actor: Actor,
  ): Promise<ActivationDelivered> {
    const employee = await this.employees.requireById(employeeId);
    if (employee.status !== 'ACTIVE') {
      throw new DomainError(
        'EMPLOYEE_NOT_ACTIVE',
        409,
        'A code is issued to an active employee only',
      );
    }
    if (channel === 'EMAIL') {
      if (!this.mail)
        throw new DomainError('MAIL_NOT_CONFIGURED', 503, 'SMTP_URL and MAIL_FROM are not set');
      if (!employee.email)
        throw new DomainError('EMPLOYEE_NO_EMAIL', 422, 'The employee has no e-mail');
    } else {
      if (!this.telegram?.enabled) {
        throw new DomainError('TELEGRAM_NOT_CONFIGURED', 503, 'The worker bot is not configured');
      }
      if (!employee.telegramUsername) {
        throw new DomainError('EMPLOYEE_NO_TELEGRAM', 422, 'The employee has no Telegram username');
      }
    }
    // Resolve the chat before issuing a code, so a failed lookup burns nothing.
    const contact =
      channel === 'TELEGRAM'
        ? await this.contacts.findByUsername(employee.telegramUsername!)
        : null;
    if (channel === 'TELEGRAM' && !contact) {
      throw new DomainError(
        'TELEGRAM_NOT_STARTED',
        409,
        'The employee has not opened the bot yet; a bot cannot write first',
      );
    }

    const issued = await this.activation.issue(employeeId, actor);
    const t = messages(employee.locale ?? DEFAULT_LOCALE);
    const zone = this.config.get('DEFAULT_SITE_TIMEZONE', { infer: true });
    const card = {
      name: employee.fullName,
      code: issued.code,
      deepLink: issued.deepLink,
      botUsername: this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
      expires: DateTime.fromISO(issued.expiresAt, { zone })
        .setLocale(employee.locale ?? DEFAULT_LOCALE)
        .toFormat('dd.MM.yyyy HH:mm'),
    };
    const png = await QRCode.toBuffer(issued.deepLink, { type: 'png', width: 320, margin: 1 });

    let sentTo: string;
    if (channel === 'EMAIL') {
      await this.mail!.send({
        to: employee.email!,
        subject: t.activation.emailSubject,
        text: activationText(t, card),
        html: activationHtml(t, card, 'activation-qr'),
        attachments: [
          {
            filename: 'vakhta-qr.png',
            content: png,
            contentType: 'image/png',
            cid: 'activation-qr',
          },
        ],
      });
      sentTo = maskEmail(employee.email!);
    } else {
      await this.telegram!.sendActivationCard(contact!.chatId, {
        png,
        caption: format(t.activation.telegramCaption, {
          name: employee.fullName,
          code: issued.code,
          expires: card.expires,
        }),
        button: t.activation.telegramButton,
        url: issued.deepLink,
      });
      sentTo = `@${employee.telegramUsername}`;
    }
    await this.audit.record(this.db, {
      actor,
      action: 'employee.activation.send',
      objectType: 'employee',
      objectId: employeeId,
      after: { channel, sentTo, expiresAt: issued.expiresAt },
    });
    return { channel, sentTo, issued };
  }
}
