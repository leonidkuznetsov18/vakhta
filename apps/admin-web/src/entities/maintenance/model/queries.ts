import { queryOptions } from '@tanstack/react-query';
import type {
  CalendarQuery,
  EquipmentQuery,
  MaintenanceOverviewQuery,
  WorkQuery,
} from '@vakhta/contracts';
import { localActivity } from '@/shared/api/activity';
import { maintenanceApi } from '../api/maintenance-api';

/** Hierarchical keys: every maintenance read sits under `maintenance`, so one prefix refreshes all. */
export const maintenanceKeys = {
  all: ['maintenance'] as const,
  summary: () => ['maintenance', 'summary'] as const,
  overview: (query: MaintenanceOverviewQuery) =>
    ['maintenance', 'overview', query.siteId ?? null, query.orgUnitId ?? null] as const,
  policy: () => ['maintenance', 'policy'] as const,
  mechanics: () => ['maintenance', 'mechanics'] as const,
  equipment: () => ['maintenance', 'equipment'] as const,
  equipmentList: (query: EquipmentQuery) =>
    [
      'maintenance',
      'equipment',
      'list',
      query.unitId ?? null,
      query.state ?? null,
      query.q ?? '',
      query.archived,
    ] as const,
  equipmentDetail: (id: string) => ['maintenance', 'equipment', 'detail', id] as const,
  library: () => ['maintenance', 'documents'] as const,
  documentLink: (documentId: string) => ['maintenance', 'documents', 'link', documentId] as const,
  plan: (planId: string) => ['maintenance', 'plans', planId] as const,
  work: () => ['maintenance', 'work'] as const,
  workList: (query: WorkQuery) =>
    [
      'maintenance',
      'work',
      'list',
      query.view,
      query.equipmentId ?? null,
      query.mechanicId ?? null,
    ] as const,
  workDetail: (id: string) => ['maintenance', 'work', 'detail', id] as const,
  photoLink: (workId: string, mediaId: string) =>
    ['maintenance', 'work', 'photo', workId, mediaId] as const,
  planDiff: (workId: string) => ['maintenance', 'work', 'plan-diff', workId] as const,
  calendar: (query: CalendarQuery) =>
    [
      'maintenance',
      'calendar',
      query.from,
      query.to,
      query.unitId ?? null,
      query.mechanicId ?? null,
      query.equipmentId ?? null,
    ] as const,
};

export const maintenanceQueries = {
  summary: () =>
    queryOptions({
      queryKey: maintenanceKeys.summary(),
      queryFn: ({ signal }) => maintenanceApi.summary(signal),
      meta: localActivity,
    }),
  /** Equipment facts of the Overview page; polled like the page's other sources. */
  overview: (query: MaintenanceOverviewQuery) =>
    queryOptions({
      queryKey: maintenanceKeys.overview(query),
      queryFn: ({ signal }) => maintenanceApi.overview(query, signal),
      refetchInterval: 60_000,
      placeholderData: (previous) => previous,
    }),
  policy: () =>
    queryOptions({
      queryKey: maintenanceKeys.policy(),
      queryFn: ({ signal }) => maintenanceApi.policy(signal),
      staleTime: 5 * 60_000,
    }),
  mechanics: () =>
    queryOptions({
      queryKey: maintenanceKeys.mechanics(),
      queryFn: ({ signal }) => maintenanceApi.mechanics(signal),
      staleTime: 5 * 60_000,
    }),
  equipmentList: (query: EquipmentQuery) =>
    queryOptions({
      queryKey: maintenanceKeys.equipmentList(query),
      queryFn: ({ signal }) => maintenanceApi.equipment(query, signal),
      meta: localActivity,
    }),
  equipmentDetail: (id: string) =>
    queryOptions({
      queryKey: maintenanceKeys.equipmentDetail(id),
      queryFn: ({ signal }) => maintenanceApi.equipmentDetail(id, signal),
      meta: localActivity,
    }),
  library: () =>
    queryOptions({
      queryKey: maintenanceKeys.library(),
      queryFn: ({ signal }) => maintenanceApi.library(signal),
    }),
  documentLink: (documentId: string) =>
    queryOptions({
      queryKey: maintenanceKeys.documentLink(documentId),
      queryFn: ({ signal }) => maintenanceApi.documentLink(documentId, signal),
      // A signed link lives five minutes on the server; never reuse one close to expiry.
      staleTime: 60_000,
      gcTime: 2 * 60_000,
      retry: false,
    }),
  plan: (planId: string) =>
    queryOptions({
      queryKey: maintenanceKeys.plan(planId),
      queryFn: ({ signal }) => maintenanceApi.plan(planId, signal),
      meta: localActivity,
    }),
  workList: (query: WorkQuery) =>
    queryOptions({
      queryKey: maintenanceKeys.workList(query),
      queryFn: ({ signal }) => maintenanceApi.work(query, signal),
      meta: localActivity,
      // An unaccepted repair counts down on this screen; keep it current without SSE.
      refetchInterval: 30_000,
    }),
  workDetail: (id: string) =>
    queryOptions({
      queryKey: maintenanceKeys.workDetail(id),
      queryFn: ({ signal }) => maintenanceApi.workDetail(id, signal),
      meta: localActivity,
      refetchInterval: 30_000,
    }),
  photoLink: (workId: string, mediaId: string) =>
    queryOptions({
      queryKey: maintenanceKeys.photoLink(workId, mediaId),
      queryFn: ({ signal }) => maintenanceApi.photoLink(workId, mediaId, signal),
      // Each view is audited on the server; a signed link is reused only briefly.
      staleTime: 60_000,
      gcTime: 2 * 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    }),
  planDiff: (workId: string) =>
    queryOptions({
      queryKey: maintenanceKeys.planDiff(workId),
      queryFn: ({ signal }) => maintenanceApi.planDiff(workId, signal),
      retry: false,
    }),
  calendar: (query: CalendarQuery) =>
    queryOptions({
      queryKey: maintenanceKeys.calendar(query),
      queryFn: ({ signal }) => maintenanceApi.calendar(query, signal),
      meta: localActivity,
    }),
};
