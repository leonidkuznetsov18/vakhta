import { messages } from '@vakhta/i18n';
import { ApiError } from './api.ts';
import { currentLocale } from './i18n.tsx';

const t = messages(currentLocale());

/** Текст для користувача: 403 → «недостатньо прав», відомі коди домену → каталог, інакше повідомлення сервера. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return t.admin.schedule.forbidden;
    if (e.status === 0) return t.admin.auth.networkError;
    const known = (t.errors as Record<string, string>)[e.code ?? ''];
    return known ?? e.message;
  }
  if (e instanceof TypeError) return t.admin.auth.networkError;
  return e instanceof Error ? e.message : String(e);
}
