import { Bot, InputFile, type Context } from 'grammy';
import type { Logger } from 'pino';
import { resolveLocale, type Locale } from '@vakhta/domain';
import { format, messages, type Messages } from '@vakhta/i18n';
import type { SupportService } from './support.service.js';

export interface SupportBotDeps {
  readonly support: SupportService;
  readonly logger: Logger;
}

/** Telegram voice notes are fetched through the file API with the bot token in the path. */
async function downloadVoice(ctx: Context, token: string): Promise<Uint8Array> {
  const file = await ctx.getFile();
  if (!file.file_path) throw new Error('voice file has no path');
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`voice download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The support assistant bot: text in, text out; a voice note in, a voice note and its text out.
 * Access, limits and the model live in SupportService; the bot only talks.
 */
export function createSupportBot(token: string, deps: SupportBotDeps): Bot {
  const bot = new Bot(token);

  const t = (ctx: Context, locale?: Locale): Messages =>
    messages(locale ?? resolveLocale(ctx.from?.language_code));
  const user = (ctx: Context) => ({
    telegramUserId: ctx.from?.id ?? 0,
    languageCode: ctx.from?.language_code,
  });

  async function answerText(ctx: Context, question: string): Promise<void> {
    const result = await deps.support.ask(user(ctx), question);
    if (!result.ok) {
      const tt = t(ctx);
      const text =
        result.reason === 'NO_ACCESS'
          ? tt.support.noAccess
          : result.reason === 'RATE_LIMITED'
            ? tt.support.rateLimited
            : tt.support.unavailable;
      await ctx.reply(text);
      return;
    }
    await ctx.reply(result.answer, { link_preview_options: { is_disabled: true } });
  }

  bot.command('start', async (ctx) => {
    const { allowed, locale } = await deps.support.access(user(ctx));
    const tt = t(ctx, locale);
    await ctx.reply(allowed ? tt.support.greeting : tt.support.noAccess);
  });

  bot.command('reset', async (ctx) => {
    await deps.support.reset(user(ctx).telegramUserId);
    const { locale } = await deps.support.access(user(ctx));
    await ctx.reply(t(ctx, locale).support.reset);
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    try {
      await ctx.replyWithChatAction('typing');
      await answerText(ctx, ctx.message.text);
    } catch (error) {
      deps.logger.warn({ err: error }, 'support: text answer failed');
      await ctx.reply(t(ctx).support.error);
    }
  });

  bot.on('message:voice', async (ctx) => {
    const { allowed, locale } = await deps.support.access(user(ctx));
    const tt = t(ctx, locale);
    if (!allowed) return ctx.reply(tt.support.noAccess);
    if (!deps.support.voiceEnabled) return ctx.reply(tt.support.voiceOff);
    try {
      await ctx.replyWithChatAction('typing');
      const audio = await downloadVoice(ctx, token);
      const question = await deps.support.transcribe(audio, locale);
      if (!question) return ctx.reply(tt.support.notHeard);
      await ctx.reply(format(tt.support.transcribed, { text: question }));
      const result = await deps.support.ask(user(ctx), question);
      if (!result.ok) {
        await ctx.reply(
          result.reason === 'RATE_LIMITED' ? tt.support.rateLimited : tt.support.unavailable,
        );
        return;
      }
      await ctx.reply(result.answer, { link_preview_options: { is_disabled: true } });
      await ctx.replyWithChatAction('record_voice');
      const speech = await deps.support.speak(result.answer, locale);
      await ctx.replyWithVoice(new InputFile(speech, 'answer.ogg'));
    } catch (error) {
      deps.logger.warn({ err: error }, 'support: voice answer failed');
      await ctx.reply(tt.support.error);
    }
  });

  bot.on('message', async (ctx) => {
    await ctx.reply(t(ctx).support.textOnly);
  });

  bot.catch((error) => {
    deps.logger.error(
      { err: error.error, updateId: error.ctx.update.update_id },
      'support bot error',
    );
  });

  return bot;
}
