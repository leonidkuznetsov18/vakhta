import { Injectable } from '@nestjs/common';
import { Api } from 'grammy';
import { ControlError } from '../common/domain-error.js';

export interface BotIdentity {
  readonly id: number;
  readonly username: string;
}

/** Telegram Bot API calls the control service makes; tokens never leave this process. */
@Injectable()
export class TelegramProvider {
  async verifyToken(token: string): Promise<BotIdentity> {
    try {
      const me = await new Api(token).getMe();
      if (!me.username)
        throw new ControlError('BOT_WITHOUT_USERNAME', 422, 'The bot has no username');
      return { id: me.id, username: me.username };
    } catch (error) {
      if (error instanceof ControlError) throw error;
      throw new ControlError('BOT_TOKEN_INVALID', 422, 'Telegram rejected the bot token');
    }
  }

  async setWebhook(token: string, url: string, secret: string): Promise<void> {
    await new Api(token).setWebhook(url, {
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(token: string): Promise<void> {
    await new Api(token).deleteWebhook();
  }
}
