import type { Query } from '@tanstack/react-query';

/** The owning surface renders the refresh of these reads; the header slot ignores them. */
export const localActivity = { globalActivity: false } as const;

export function hasGlobalActivity(query: Query): boolean {
  return query.meta?.['globalActivity'] !== false;
}
