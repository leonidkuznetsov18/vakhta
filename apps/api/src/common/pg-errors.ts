/** Коди PostgreSQL, які застосунок перетворює на доменні помилки. Drizzle загортає помилку драйвера в cause. */
const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';

function pgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === UNIQUE_VIOLATION;
}

export function isExclusionViolation(error: unknown): boolean {
  return pgCode(error) === EXCLUSION_VIOLATION;
}

/** 23503: a row is still referenced (a terminal with check-ins, a site with units). */
export function isForeignKeyViolation(e: unknown): boolean {
  return pgCode(e) === '23503';
}
