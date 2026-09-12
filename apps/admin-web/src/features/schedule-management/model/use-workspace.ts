import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateScheduleVersionCommand, ScheduleVersionView } from '@vakhta/contracts';
import { useOrg, useEmployees } from '@/lib/org';
import { usePersistentState } from '@/lib/ui-store';
import { useNavigation } from '@/navigation';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { scheduleApi } from '../api/schedule-api';
import { capabilities, EMPTY_GRID, preferredVersion } from './planning';
import {
  countChanges,
  gridFromDetail,
  gridToItems,
  restoreLegacyGrid,
  type GridState,
} from './grid';
import { useScheduleDrafts } from './store';
import { PRESET_KEY, clearSchedulePreset, type SchedulePreset } from './preset';

const t = messages(currentLocale()).scheduleWorkspace;
type Selection = { scope: string; id: string };
type Write = {
  id: string;
  scope: string;
  grid: GridState;
  reason: string;
  action: 'save' | 'revise' | 'publish' | 'submit' | 'return' | 'remove';
};

/** Server snapshots and local transactions have separate ownership. Filters never trim write payloads. */
export function useWorkspace() {
  const client = useQueryClient();
  const { grants, roles } = useNavigation();
  const orgResult = useOrg();
  const { org } = orgResult;
  const canReadEmployees = roles.some((role) =>
    ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'].includes(role),
  );
  const employeeResult = useEmployees(canReadEmployees);
  const [storedSite, setSite] = usePersistentState('schedule.siteId', '');
  const [storedUnit, setUnit] = usePersistentState('schedule.orgUnitId', '');
  const [month, setMonth] = usePersistentState('schedule.month', () =>
    new Date().toISOString().slice(0, 7),
  );
  const [preset] = usePersistentState<SchedulePreset | null>(PRESET_KEY, null);
  const unit = org?.orgUnits.find((item) => item.id === storedUnit);
  const siteId =
    unit?.siteId ??
    org?.sites.find((item) => item.id === storedSite)?.id ??
    org?.sites[0]?.id ??
    '';
  const units = org?.orgUnits.filter((item) => item.siteId === siteId) ?? [];
  const orgUnitId = unit?.id ?? units[0]?.id ?? '';
  const zones = org?.zones.filter((item) => item.orgUnitId === orgUnitId) ?? [];
  const scope = `${siteId}|${orgUnitId}|${month}`;
  const rights = capabilities(grants, siteId, orgUnitId);
  const [picked, setPicked] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const listInput = { siteId, orgUnitId, periodMonth: month };
  const versionsQuery = useQuery({
    queryKey: keys.schedules(listInput),
    queryFn: ({ signal }) => scheduleApi.list(listInput, signal),
    enabled: !!siteId && !!orgUnitId,
  });
  const templatesQuery = useQuery({
    queryKey: keys.templates(siteId),
    queryFn: ({ signal }) => scheduleApi.templates(siteId, signal),
    enabled: !!siteId,
  });
  const versions = versionsQuery.data ?? [];
  const current = preferredVersion(versions);
  const selected =
    picked?.scope === scope ? (versions.find((v) => v.id === picked.id) ?? current) : current;
  const id = selected?.id ?? '';
  const detailQuery = useQuery({
    queryKey: keys.schedule(id),
    queryFn: ({ signal }) => scheduleApi.detail(id, signal),
    enabled: !!id,
  });
  const published = versions.find((v) => v.status === 'PUBLISHED');
  const publishedQuery = useQuery({
    queryKey: keys.schedule(published?.id ?? null),
    queryFn: ({ signal }) => scheduleApi.detail(published?.id ?? '', signal),
    enabled: !!published,
  });
  const detail = detailQuery.data;
  const version = detail?.version;
  const baseline = detail ? gridFromDetail(detail) : EMPTY_GRID;
  const store = useScheduleDrafts();
  const kept = store.drafts[id];
  const legacy = !!kept && !store.baselines[id];
  const localGrid = kept && legacy ? restoreLegacyGrid(kept, baseline) : (kept ?? baseline);
  const savedBaseline = store.baselines[id];
  const stale = !!kept && !!savedBaseline && countChanges(savedBaseline, baseline) > 0;
  const changes = countChanges(baseline, localGrid);
  const canEdit =
    (version?.status === 'DRAFT' && rights.edit) ||
    (version?.status === 'PUBLISHED' && rights.publish);
  const grid = canEdit ? localGrid : baseline;
  const readOnlyChanges = !canEdit && (changes > 0 || legacy);
  const editMode = canEdit && (editing === id || (!!kept && changes > 0));
  const missingIds = [...new Set(gridToItems(grid).map((item) => item.employeeId))].filter(
    (employeeId) => !employeeResult.employees.some((employee) => employee.id === employeeId),
  );
  const extraQueries = useQueries({
    queries: missingIds.map((employeeId) => ({
      queryKey: ['employees', employeeId],
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.employee(employeeId, signal),
      enabled: canReadEmployees,
    })),
  });
  const employees = [
    ...employeeResult.employees,
    ...extraQueries.flatMap((query) => (query.data ? [query.data] : [])),
  ];
  const presetHere =
    preset?.month === month && (preset.orgUnitId === null || preset.orgUnitId === orgUnitId)
      ? preset
      : null;
  const refresh = () => client.invalidateQueries({ queryKey: ['schedules'] });
  const create = useMutation({
    mutationFn: ({ input }: { input: CreateScheduleVersionCommand; scope: string }) =>
      scheduleApi.create(input),
    onSuccess: async (created, variables) => {
      // Only an unchanged workspace can receive the response's selection.
      setPicked((previous) =>
        previous?.scope === variables.scope ? { scope: variables.scope, id: created.id } : previous,
      );
      setEditing(created.id);
      await refresh();
    },
    retry: false,
  });
  const write = useMutation({
    mutationFn: async (input: Write) => {
      const body = { items: gridToItems(input.grid) };
      switch (input.action) {
        case 'save':
          return scheduleApi.save(input.id, body);
        case 'revise':
          return scheduleApi.revise(input.id, {
            ...body,
            ...(input.reason ? { changeReason: input.reason } : {}),
          });
        case 'publish':
          return scheduleApi.publish(input.id, input.reason ? { changeReason: input.reason } : {});
        case 'submit':
          return scheduleApi.submit(input.id);
        case 'return':
          return scheduleApi.returnDraft(input.id, { comment: input.reason });
        case 'remove':
          return scheduleApi.remove(input.id);
      }
    },
    onSuccess: async (result, variables) => {
      if (
        ['save', 'revise', 'remove'].includes(variables.action) &&
        useScheduleDrafts.getState().drafts[variables.id] === variables.grid
      )
        useScheduleDrafts.getState().drop(variables.id);
      if (variables.action === 'save' || variables.action === 'revise') clearSchedulePreset();
      if (result && 'version' in result)
        client.setQueryData(keys.schedule(result.version.id), result);
      if (result && 'id' in result) {
        setPicked((previous) =>
          previous?.scope === variables.scope && previous.id === variables.id
            ? { scope: variables.scope, id: result.id }
            : previous,
        );
      }
      notifySuccess(
        variables.action === 'revise' || variables.action === 'publish'
          ? t.success
          : variables.action === 'submit'
            ? t.submitted
            : t.saved,
      );
      await refresh();
    },
    retry: false,
  });
  const busy = create.isPending || write.isPending;
  const writable = !!editMode && !busy && !stale && !legacy && !detailQuery.isError;
  function select(value: ScheduleVersionView) {
    if (busy) return;
    setPicked({ scope, id: value.id });
    setEditing(null);
  }
  function begin() {
    if (busy || !version || !canEdit) return;
    setPicked({ scope, id });
    setEditing(id);
  }
  function createDraft() {
    if (busy || !rights.edit || !orgUnitId || !versionsQuery.isSuccess) return;
    const draft = versions.find((value) => value.status === 'DRAFT');
    if (draft) {
      select(draft);
      setEditing(draft.id);
      return;
    }
    setPicked({ scope, id });
    create.mutate({
      scope,
      input: {
        siteId,
        orgUnitId,
        periodMonth: month,
        ...(published ? { basedOnVersionId: published.id } : {}),
      },
    });
  }
  function edit(next: GridState) {
    if (writable && gridToItems(next).length <= 5000) store.keep(id, next, baseline);
  }
  function commit(action: Write['action'], reason = '', snapshot = grid) {
    if (!version || busy || stale || legacy || snapshot !== grid || detailQuery.isError) return;
    const allowed =
      action === 'save'
        ? writable && version.status === 'DRAFT' && changes > 0
        : action === 'revise'
          ? writable && version.status === 'PUBLISHED' && changes > 0
          : action === 'publish'
            ? rights.publish && version.status === 'IN_REVIEW' && changes === 0
            : action === 'submit'
              ? rights.edit &&
                version.status === 'DRAFT' &&
                changes === 0 &&
                gridToItems(grid).length > 0
              : action === 'return'
                ? rights.publish &&
                  version.status === 'IN_REVIEW' &&
                  changes === 0 &&
                  reason.trim().length >= 3
                : rights.edit && version.deletable;
    if (allowed) {
      setPicked({ scope, id });
      write.mutate({ id, scope, grid: snapshot, action, reason });
    }
  }
  function resetSelection() {
    setPicked(null);
    setEditing(null);
  }
  return {
    orgResult,
    employeeResult,
    canReadEmployees,
    extraQueries,
    org,
    employees,
    units,
    zones,
    siteId,
    orgUnitId,
    month,
    scope,
    rights,
    versionsQuery,
    templatesQuery,
    detailQuery,
    publishedQuery,
    published,
    versions,
    version,
    grid,
    baseline,
    changes,
    stale,
    legacy,
    localGrid,
    readOnlyChanges,
    timezone: org?.sites.find((site) => site.id === siteId)?.timezone ?? 'UTC',
    recorded: detail?.assignments ?? [],
    restoreLegacy() {
      if (legacy && canEdit && !busy && detailQuery.isSuccess) store.restore(id, grid, baseline);
    },
    store,
    busy,
    writable,
    editMode,
    templates: templatesQuery.data ?? [],
    error: create.error ?? write.error,
    preset: presetHere,
    publicationBaseline: publishedQuery.data ? gridFromDetail(publishedQuery.data) : EMPTY_GRID,
    publicationReady: !published || publishedQuery.isSuccess,
    removeHistory(versionId: string) {
      const target = versions.find((value) => value.id === versionId);
      if (!busy && rights.edit && target?.deletable && target.status === 'SUPERSEDED')
        write.mutate({
          id: versionId,
          scope,
          grid: store.drafts[versionId] ?? EMPTY_GRID,
          action: 'remove',
          reason: '',
        });
    },
    select,
    begin,
    finish() {
      if (!busy && changes === 0 && !legacy) setEditing(null);
    },
    createDraft,
    edit,
    commit,
    changeSite(value: string) {
      if (busy) return;
      resetSelection();
      setSite(value);
      setUnit(org?.orgUnits.find((item) => item.siteId === value)?.id ?? '');
    },
    changeUnit(value: string) {
      if (busy) return;
      resetSelection();
      setUnit(value);
    },
    changeMonth(value: string) {
      if (busy) return;
      resetSelection();
      setMonth(value);
    },
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
