/**
 * House rule for every form: the submit button stays disabled while nothing changed. Edit forms
 * compare the draft with the record on screen; create forms are "unchanged" while their required
 * fields are still empty.
 */
export function isUnchanged(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

export function isBlank(value: string | null | undefined): boolean {
  return (value ?? '').trim().length === 0;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)),
        )
      : v,
  );
}
