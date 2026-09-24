/** Substitutes {key} placeholders. Unknown keys are left as is so the gap is visible in the text. */
export function format(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
