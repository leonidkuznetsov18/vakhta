import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the panel. The defaults are written for a factory floor: a screen left open on a
 * wall is expected to be current, so data is refetched when the tab is looked at again, but a
 * master flipping between sections should not see a spinner for something read seconds ago.
 *
 * Live screens (the shift, the incidents, the reports) push their own invalidation over SSE, so
 * they need no polling on top of this.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

/**
 * Query keys, in one place. A key written by hand at the call site is a key nobody can invalidate
 * from anywhere else, and a stale screen after a save is the bug that follows.
 */
export const keys = {
  me: ['me'] as const,
  org: ['org'] as const,
  users: ['users'] as const,
  employees: ['employees'] as const,
  scheduleRoster: ['employees', 'schedule-complete'] as const,
  employee: (id: string) => ['employees', id] as const,
  employeePositions: (id: string) => ['employees', id, 'positions'] as const,
  shifts: (q: unknown) => ['shifts', q] as const,
  shift: (id: string | null) => ['shifts', 'detail', id] as const,
  handovers: (q: unknown) => ['handovers', q] as const,
  handover: (id: string | null) => ['handovers', 'detail', id] as const,
  incidents: (q: unknown) => ['incidents', q] as const,
  incident: (id: string | null) => ['incidents', 'detail', id] as const,
  incidentStats: (q: unknown) => ['incidents', 'stats', q] as const,
  requests: (q: unknown) => ['requests', q] as const,
  request: (id: string | null) => ['requests', 'detail', id] as const,
  overtime: (scope: string) => ['requests', 'overtime', scope] as const,
  schedules: (q: unknown) => ['schedules', q] as const,
  schedule: (id: string | null) => ['schedules', 'detail', id] as const,
  templates: (siteId: string) => ['schedules', 'templates', siteId] as const,
  bonusPoints: (q: unknown) => ['bonus', 'points', q] as const,
  bonusHistory: (q: unknown) => ['bonus', 'history', q] as const,
  losses: (q: unknown) => ['reports', 'losses', q] as const,
  audit: (q: unknown) => ['audit', q] as const,
  /** A signed link to one photo; short-lived on the server, so cached only briefly here. */
  media: (id: string) => ['media', id] as const,
  /** A QR drawn on the client: the same link and size always draw the same picture. */
  qr: (value: string, size: number) => ['qr', value, size] as const,
  checklists: ['checklists'] as const,
  terminals: ['terminals'] as const,
};
