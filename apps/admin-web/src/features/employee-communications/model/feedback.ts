import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { readError } from '@/errors';
export function communicationError(error: unknown) {
  if (!error) return null;
  const t = messages(currentLocale()).communications;
  if (error instanceof ApiError && error.code) {
    const entry = Object.entries(t.errors).find(([key]) => key === error.code);
    if (entry) return entry[1];
  }
  return readError(error) ?? t.error;
}
