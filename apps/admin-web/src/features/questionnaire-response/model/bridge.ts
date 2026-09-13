import { z } from 'zod';
const BridgeAction = z.custom<() => void>((value) => typeof value === 'function');
const TelegramBridge = z.object({
  WebApp: z.object({ initData: z.string().max(16_384), ready: BridgeAction, expand: BridgeAction }),
});
/** Runs before admin hash routing. Launch data stays in memory and is never logged or persisted. */
export async function loadQuestionnaireBridge(): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error('Telegram bridge unavailable'));
    }, 10_000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Telegram bridge unavailable'));
    };
    document.head.append(script);
  });
  const raw: unknown = Reflect.get(window, 'Telegram');
  const { WebApp } = TelegramBridge.parse(raw);
  WebApp.ready();
  WebApp.expand();
  return WebApp.initData;
}
