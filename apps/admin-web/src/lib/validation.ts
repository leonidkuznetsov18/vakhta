import { z } from 'zod';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

/**
 * Zod issues in the panel language. Registered once at start-up (and in the test setup), so
 * every contract from `@vakhta/contracts` reports human messages without touching the schemas.
 */
export function installZodLocale(): void {
  z.config({
    customError: (issue) => {
      const t = messages(currentLocale()).ui.common;
      switch (issue.code) {
        case 'too_small': {
          const min = Number(issue.minimum);
          if (min <= 1) return t.required;
          return format(t.minLength, { min });
        }
        case 'too_big':
          return format(t.maxLength, { max: Number(issue.maximum) });
        case 'invalid_type':
          return issue.input === undefined || issue.input === '' ? t.required : t.invalidValue;
        case 'invalid_format':
          return issue.format === 'email' ? t.invalidEmail : t.invalidValue;
        default:
          return t.invalidValue;
      }
    },
  });
}

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

/**
 * Validates form values with a contract before the request leaves the browser and returns the
 * first message per top-level field, ready for `FormField.error`.
 */
export function validateWith<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.output<S>; errors: FieldErrors } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
