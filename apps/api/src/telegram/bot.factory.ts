import { Bot } from 'grammy';
import type { Logger } from 'pino';
import { isValidStartParam } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';

/**
 * Збирає grammY-бота з обробниками. Фаза 0: лише /start і заглушки; стан екрана
 * рендеритиметься сервером (ADR-11) починаючи з фази 1.
 */
export function createBot(token: string, logger: Logger): Bot {
  const bot = new Bot(token);
  const t = messages('ru');

  bot.command('start', async (ctx) => {
    const startParam = ctx.match;
    if (startParam && isValidStartParam(startParam)) {
      // Deep link з терміналу (FR-QR-02). Обробка challenge з'явиться у фазі 2.
      await ctx.reply(t.bot.qrReceivedNotReady);
      return;
    }
    await ctx.reply(t.bot.welcome);
  });

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: t.bot.notReady });
  });

  bot.on('message', async (ctx) => {
    await ctx.reply(t.bot.useButtons);
  });

  bot.catch((err) => {
    logger.error(
      { err: err.error, updateId: err.ctx.update.update_id },
      'помилка в обробнику бота',
    );
  });

  return bot;
}
