export const sectionIds = [
  'top',
  'product',
  'problem',
  'workflow',
  'worker',
  'capabilities',
  'teams',
  'demo',
  'pilot',
  'trust',
  'investors',
  'faq',
  'contact',
] as const;

export function localizedHref(path: string, hash: string): string {
  const section = hash.slice(1);
  return sectionIds.some((id) => id === section) ? `${path}#${section}` : path;
}
