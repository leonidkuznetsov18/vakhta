export interface DatedCompensation {
  readonly id: string;
  readonly effectiveFrom: string;
  readonly correctsEntryId: string | null;
  readonly createdAt: string;
}

export function compensationHistory<T extends DatedCompensation>(
  entries: readonly T[],
  date: string,
) {
  const corrected = new Set(
    entries.flatMap((entry) => (entry.correctsEntryId ? [entry.correctsEntryId] : [])),
  );
  return [...entries]
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )
    .map((entry) => ({
      ...entry,
      state: corrected.has(entry.id)
        ? ('CORRECTED' as const)
        : entry.effectiveFrom > date
          ? ('SCHEDULED' as const)
          : ('EFFECTIVE' as const),
    }));
}

export function effectiveCompensation<T extends DatedCompensation>(
  entries: readonly T[],
  date: string,
) {
  return compensationHistory(entries, date).find((entry) => entry.state === 'EFFECTIVE') ?? null;
}
