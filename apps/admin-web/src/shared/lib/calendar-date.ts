import { enGB, ru, uk } from 'react-day-picker/locale';
import { currentLocale } from '@/i18n';

const DAY_PICKER_LOCALES = { uk, en: enGB, ru } as const;

export function dayPickerLocale() {
  return DAY_PICKER_LOCALES[currentLocale()];
}

/** 'YYYY-MM-DD' in local time; dates from the API are calendar dates, not instants. */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromIsoDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function fromIsoMonth(value: string): Date | undefined {
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return undefined;
  return new Date(y, m - 1, 1);
}
