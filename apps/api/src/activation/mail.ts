import nodemailer, { type Transporter } from 'nodemailer';

export interface MailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: string;
  /** Inline image reference for `<img src="cid:…">`. */
  readonly cid?: string;
}

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly attachments?: readonly MailAttachment[];
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_SENDER = Symbol('MAIL_SENDER');

/** SMTP through nodemailer: any provider (Resend, Postmark, Google Workspace, an own relay). */
export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: (message.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        ...(a.cid ? { cid: a.cid } : {}),
      })),
    });
  }
}
