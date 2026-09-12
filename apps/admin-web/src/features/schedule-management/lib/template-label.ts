/** Translate built-in shift codes while preserving custom template names. */
export function templateLabel(
  code: string,
  labels: { dayShift: string; nightShift: string },
): string {
  if (code === 'DAY') return labels.dayShift;
  if (code === 'NIGHT') return labels.nightShift;
  return code;
}
