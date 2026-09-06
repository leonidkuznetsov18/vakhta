import type { Messages } from '@vakhta/i18n';
import { format } from '@vakhta/i18n';

export interface CardInput {
  readonly name: string;
  readonly code: string;
  readonly deepLink: string;
  readonly botUsername: string;
  /** Already formatted for the employee's language and the site time zone. */
  readonly expires: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-text twin of the e-mail: mail clients without HTML and the Telegram caption share it. */
export function activationText(t: Messages, input: CardInput): string {
  const a = t.activation;
  return [
    format(a.greeting, { name: input.name }),
    '',
    a.emailIntro,
    `1. ${a.emailStepLink} ${input.deepLink}`,
    `2. ${a.emailStepQr}`,
    `3. ${format(a.emailStepCode, { bot: input.botUsername, code: input.code })}`,
    '',
    `${a.codeLabel}: ${input.code}`,
    format(a.validUntil, { expires: input.expires }),
    '',
    a.emailFooter,
  ].join('\n');
}

/**
 * The e-mail: one column, system fonts, the code in a large box, a button with the deep link and
 * the QR inline (cid), so it renders in Gmail, Outlook and phone clients without remote images.
 */
export function activationHtml(t: Messages, input: CardInput, qrCid: string): string {
  const a = t.activation;
  const e = escapeHtml;
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:18px;font-weight:600">${e(format(a.greeting, { name: input.name }))}</td></tr>
<tr><td style="padding:0 28px 16px;font-size:15px;line-height:1.5">${e(a.emailIntro)}</td></tr>
<tr><td style="padding:0 28px 8px;font-size:13px;color:#57534e">${e(a.codeLabel)}</td></tr>
<tr><td style="padding:0 28px 20px"><div style="display:inline-block;padding:12px 18px;border:1px solid #d6d3d1;border-radius:10px;background:#fafaf9;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;letter-spacing:6px;font-weight:600">${e(input.code)}</div></td></tr>
<tr><td style="padding:0 28px 20px"><a href="${e(input.deepLink)}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600">${e(a.openBot)}</a></td></tr>
<tr><td style="padding:0 28px 8px;font-size:14px;line-height:1.5">
<ol style="margin:0;padding-left:20px">
<li style="margin-bottom:6px">${e(a.emailStepLink)}</li>
<li style="margin-bottom:6px">${e(a.emailStepQr)}</li>
<li>${e(format(a.emailStepCode, { bot: input.botUsername, code: input.code }))}</li>
</ol></td></tr>
<tr><td style="padding:12px 28px 4px" align="center"><img src="cid:${e(qrCid)}" width="200" height="200" alt="QR" style="display:block;border:1px solid #e7e5e4;border-radius:8px"></td></tr>
<tr><td style="padding:4px 28px 16px;font-size:13px;color:#57534e" align="center">${e(format(a.validUntil, { expires: input.expires }))}</td></tr>
<tr><td style="padding:0 28px 24px;font-size:12px;color:#78716c;line-height:1.5;border-top:1px solid #e7e5e4;padding-top:16px">${e(a.emailFooter)}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
