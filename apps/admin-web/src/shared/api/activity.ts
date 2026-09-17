import type { Mutation, Query } from '@tanstack/react-query';

/** The owning surface renders feedback for these operations. */
export const localActivity = { globalActivity: false } as const;

export function hasGlobalActivity(operation: Query | Mutation): boolean {
  return operation.meta?.['globalActivity'] !== false;
}
