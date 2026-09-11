import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  IncidentStatusSchema,
  type IncidentView,
  type IncidentTransitionCommand,
  type IncidentUpdateCommand,
} from '@vakhta/contracts';
import { allowedIncidentTransitions, isOpenIncident } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { incidentsApi } from '@/api';
import { readError } from '@/errors';
import { currentLocale } from '@/i18n';
import { usePersistentState, useUiStore, setUiState } from '@/lib/ui-store';
import { useDeepLinkedId } from '@/lib/route';
import { useLiveUpdates } from '@/lib/live';
import { useOrg } from '@/lib/org';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { todayIso, formatDateTime } from '@/lib/format';
import type { LightboxImage } from '@/components/app/photo';
import { EyeIcon, CheckIcon } from 'lucide-react';
import { incidentDates, incidentPeriod, type PeriodMode } from './period';

const i = messages(currentLocale()).admin.incidents;
type Draft = {
  target: string;
  rootCause: string;
  resolution: string;
  duplicateOf: string;
  error: string | null;
};
interface WorkspaceState {
  drafts: Record<string, Partial<Draft>>;
  lightbox: LightboxImage[];
}
const initialState = (): WorkspaceState => ({ drafts: {}, lightbox: [] });
const useWorkspaceState = create<WorkspaceState>(() => initialState());
// Sign-out clears shared filters and also drops transient incident notes and signed photo URLs.
useUiStore.subscribe((state, previous) => {
  if (state.values !== previous.values && Object.keys(state.values).length === 0)
    useWorkspaceState.setState(initialState());
});
function setField(id: string, key: keyof Draft, value: string) {
  useWorkspaceState.setState((state) => ({
    drafts: { ...state.drafts, [id]: { ...state.drafts[id], [key]: value, error: null } },
  }));
}

/** Query owns records; Zustand owns only filters, selection and unsaved decisions. */
export function useIncidentWorkspace() {
  const prefix = 'incidents';
  const { org, queryState: orgQuery } = useOrg();
  const [siteId, setSiteId] = usePersistentState(`${prefix}.siteId`, '');
  const [scope, setScopeValue] = usePersistentState<'open' | 'all'>(`${prefix}.scope`, 'open');
  const [periodMode] = usePersistentState<PeriodMode>(`${prefix}.period`, 'all');
  const [date] = usePersistentState(`${prefix}.date`, todayIso);
  const [endDate] = usePersistentState(`${prefix}.endDate`, date);
  const [openId, setOpenId] = useDeepLinkedId(prefix, `${prefix}.openId`);
  const { drafts, lightbox } = useWorkspaceState(useShallow((state) => state));
  const client = useQueryClient();
  const timezone = org?.sites.find((site) => site.id === siteId)?.timezone ?? 'Europe/Kyiv';
  const dates = incidentDates(periodMode, date, endDate);
  const range = incidentPeriod(periodMode, date, timezone, endDate);
  const query = {
    ...(siteId ? { siteId } : {}),
    scope,
    ...range,
  };
  const list = useQuery({
    queryKey: keys.incidents(query),
    queryFn: () => incidentsApi.list(query),
  });
  const rows = list.data ?? [];
  const live = useLiveUpdates(incidentsApi.streamUrl(), 'incident', ['incidents']);
  const detailQuery = useQuery({
    queryKey: keys.incident(openId),
    queryFn: () => incidentsApi.detail(openId ?? ''),
    enabled: openId !== null,
  });
  const statsRange = {
    from: range.from ?? '1970-01-01T00:00:00.000Z',
    to: range.to ?? new Date().toISOString(),
    siteId,
  };
  const statsQuery = useQuery({
    queryKey: keys.incidentStats({ ...statsRange, to: range.to ?? 'now' }),
    queryFn: () => incidentsApi.stats(statsRange.from, statsRange.to, siteId || undefined),
    enabled: list.isSuccess,
  });
  function form(row: IncidentView) {
    const draft = drafts[row.id];
    const target = draft?.target ?? '';
    return {
      target,
      rootCause: draft?.rootCause ?? row.rootCause ?? '',
      resolution: draft?.resolution ?? row.resolution ?? '',
      duplicateOf: draft?.duplicateOf ?? '',
      error: draft?.error ?? null,
      requiresCause: target === 'RESOLVED' || target === 'REJECTED',
      requiresSolution: target === 'RESOLVED',
    };
  }
  const save = useMutation({
    mutationFn: (input: {
      id: string;
      command: IncidentUpdateCommand;
      transition?: IncidentTransitionCommand;
    }) =>
      input.transition
        ? incidentsApi.transition(input.id, input.transition)
        : incidentsApi.update(input.id, input.command),
    onSuccess: async (_result, input) => {
      useWorkspaceState.setState((state) => {
        const next = { ...state.drafts };
        delete next[input.id];
        return { drafts: next };
      });
      notifySuccess(input.transition ? i.applied : i.saved);
      await client.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
  const isReadOnly = (row: IncidentView) => !isOpenIncident(row.status);
  function apply(row: IncidentView) {
    if (isReadOnly(row)) return;
    const draft = form(row);
    const rootCause = draft.rootCause.trim();
    const resolution = draft.resolution.trim();
    const error =
      draft.requiresSolution && (rootCause.length < 3 || resolution.length < 3)
        ? i.requiredSolution
        : draft.requiresCause && rootCause.length < 3
          ? i.requiredCause
          : null;
    if (error) {
      useWorkspaceState.setState((state) => ({
        drafts: { ...state.drafts, [row.id]: { ...state.drafts[row.id], error } },
      }));
      return;
    }
    const command = {
      ...(rootCause !== (row.rootCause ?? '') ? { rootCause } : {}),
      ...(resolution !== (row.resolution ?? '') ? { resolution } : {}),
    };
    const target = IncidentStatusSchema.safeParse(draft.target);
    if (!target.success && !Object.keys(command).length) return;
    save.mutate({
      id: row.id,
      command,
      ...(target.success
        ? {
            transition: {
              ...command,
              to: target.data,
              ...(target.data === 'DUPLICATE' && draft.duplicateOf
                ? { duplicateOfId: draft.duplicateOf }
                : {}),
            },
          }
        : {}),
    });
  }
  const busy = save.isPending;
  const toggleRow = (row: IncidentView) => setOpenId(openId === row.id ? null : row.id);
  const setLightbox = (images: LightboxImage[]) => useWorkspaceState.setState({ lightbox: images });
  return {
    listQuery: list,
    orgQuery,
    detailQuery,
    statsQuery,
    isReadOnly,
    org,
    siteId,
    setSiteId,
    scope,
    periodMode,
    dates,
    date,
    endDate,
    live,
    rows,
    openId,
    busy,
    lightbox,
    form,
    setField,
    apply,
    toggleRow,
    detail: detailQuery.data ?? null,
    stats: statsQuery.data ?? null,
    loading: list.isPending,
    error: readError(save.error),
    setScope: (value: string) => {
      if (value === 'all' || value === 'open') setScopeValue(value);
    },
    changeDate: (key: 'from' | 'to', value: string) => {
      const next = { ...dates, [key]: value };
      if (next.from && next.to && next.from > next.to) return;
      setUiState({
        [`${prefix}.period`]: 'range',
        [`${prefix}.date`]: next.from,
        [`${prefix}.endDate`]: next.to,
      });
    },
    clearPeriod: () => setUiState({ [`${prefix}.period`]: 'all' }),
    others: (row: IncidentView) =>
      rows
        .filter((item) => item.id !== row.id && item.status !== 'DUPLICATE')
        .map((item) => ({
          value: item.id,
          label: `${formatDateTime(item.openedAt)} · ${item.reasonLabel} · ${item.zoneName ?? '—'}`,
        })),
    transitions: (row: IncidentView) =>
      allowedIncidentTransitions(row.status).map((status) => ({
        value: status,
        label: i.transitions[status],
      })),
    rowActions: (row: IncidentView) => [
      { key: 'detail', label: i.detail, icon: EyeIcon, onSelect: () => toggleRow(row) },
      ...(isReadOnly(row) ? [] : allowedIncidentTransitions(row.status)).map((status) => ({
        key: `to-${status}`,
        label: i.transitions[status],
        icon: CheckIcon,
        disabled: busy,
        onSelect: () => {
          setField(row.id, 'target', status);
          setOpenId(row.id);
        },
      })),
    ],
    trackedLink: incidentsApi.mediaLink,
    setLightbox,
    closeLightbox: () => setLightbox([]),
    searchText: (row: IncidentView) =>
      [
        row.reasonLabel,
        row.rootCause,
        row.resolution,
        row.lastComment,
        row.reportedBy,
        row.zoneName,
      ]
        .filter(Boolean)
        .join(' '),
  };
}
export type IncidentWorkspaceModel = ReturnType<typeof useIncidentWorkspace>;
