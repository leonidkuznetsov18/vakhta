/** Optional free text as stored: trimmed, and null when nothing is left. */
export function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}
