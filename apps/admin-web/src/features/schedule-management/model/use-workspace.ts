import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateScheduleVersionCommand,
  ScheduleVersionView,
  ScheduleVersionDetail,
} from '@vakhta/contracts';
import { ApiError } from '@/api';
import { useOrg } from '@/lib/org';
import { usePersistentState } from '@/lib/ui-store';
import { useNavigation } from '@/navigation';
import { scheduleAccessKey, scheduleDraftKey, scheduleKeys } from './ownership';
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
import { useScheduleRoster } from './roster';
import { PRESET_KEY, clearSchedulePreset, type SchedulePreset } from './preset';

const t = messages(currentLocale()).scheduleWorkspace;
type Selection = { scope: string; id: string };
type Write = {
  id: string;
  draftKey: string;
  expectedRevision: number;
  scope: string;
  grid: GridState;
  reason: string;
  action: 'save' | 'revise' | 'publish' | 'submit' | 'return' | 'remove';
};

/** Server snapshots and local transactions have separate ownership. Filters never trim write payloads. */
export function useWorkspace() {
  const client = useQueryClient();
  const { grants, roles, actorId } = useNavigation();
  const accessKey = scheduleAccessKey(actorId, grants);
  const [workspaceOwner] = useState(() => crypto.randomUUID());
  const orgResult = useOrg();
  const { org } = orgResult;
  const canReadEmployees =
    !!actorId &&
    roles.some((role) =>
      ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'].includes(role),
    );
  const employeeResult = useScheduleRoster(accessKey, canReadEmployees);
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
  const scope = `${accessKey}|${siteId}|${orgUnitId}|${month}`;
  const rights = capabilities(grants, siteId, orgUnitId);
  const [picked, setPicked] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const listInput = { siteId, orgUnitId, periodMonth: month };
  const versionsQuery = useQuery({
    queryKey: scheduleKeys.list(accessKey, listInput),
    meta: { workspaceOwner },
    queryFn: ({ signal }) => scheduleApi.list(listInput, signal),
    enabled: !!actorId && !!siteId && !!orgUnitId,
  });
  const templatesQuery = useQuery({
    queryKey: scheduleKeys.templates(accessKey, siteId),
    queryFn: ({ signal }) => scheduleApi.templates(siteId, signal),
    enabled: !!actorId && !!siteId,
  });
  const versions = versionsQuery.data ?? [];
  const current = preferredVersion(versions);
  const selected =
    picked?.scope === scope ? (versions.find((v) => v.id === picked.id) ?? current) : current;
  const id = selected?.id ?? '';
  const detailQuery = useQuery({
    queryKey: scheduleKeys.detail(accessKey, id),
    queryFn: ({ signal }) => scheduleApi.detail(id, signal),
    enabled: !!actorId && !!id,
  });
  const published = versions.find((v) => v.status === 'PUBLISHED');
  const publishedQuery = useQuery({
    queryKey: scheduleKeys.detail(accessKey, published?.id ?? null),
    queryFn: ({ signal }) => scheduleApi.detail(published?.id ?? '', signal),
    enabled: !!actorId && !!published,
  });
  const detail = detailQuery.data;
  const version = detail?.version;
  const baseline = detail ? gridFromDetail(detail) : EMPTY_GRID;
  const store = useScheduleDrafts();
  const draftKey = scheduleDraftKey(actorId, siteId, orgUnitId, month, id);
  const kept = actorId ? store.drafts[draftKey] : undefined;
  const unownedDraft = !!store.drafts[id];
  const legacy = !!kept && (!store.baselines[draftKey] || store.revisions[draftKey] === undefined);
  const localGrid = kept && legacy ? restoreLegacyGrid(kept, baseline) : (kept ?? baseline);
  const savedBaseline = store.baselines[draftKey];
  const stale =
    !!kept &&
    !legacy &&
    !!savedBaseline &&
    (store.revisions[draftKey] !== version?.revision || countChanges(savedBaseline, baseline) > 0);
  const changes = countChanges(baseline, localGrid);
  const canEdit =
    !!actorId &&
    !!version &&
    version.revision > 0 &&
    ((version.status === 'DRAFT' && rights.edit) ||
      (version.status === 'PUBLISHED' && rights.publish));
  const grid = canEdit ? localGrid : baseline;
  const readOnlyChanges = !canEdit && (changes > 0 || legacy);
  const editMode = canEdit && (editing === id || (!!kept && changes > 0));
  const missingIds = [...new Set(gridToItems(grid).map((item) => item.employeeId))].filter(
    (employeeId) => !employeeResult.employees.some((employee) => employee.id === employeeId),
  );
  const extraQueries = useQueries({
    queries: missingIds.map((employeeId) => ({
      queryKey: scheduleKeys.employee(accessKey, employeeId),
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.employee(employeeId, signal),
      enabled: canReadEmployees && employeeResult.loaded,
    })),
  });
  const employees = [
    ...employeeResult.employees,
    ...extraQueries.flatMap((query) => (query.data ? [query.data] : [])),
  ];
  const presetHere =
    !!actorId &&
    preset?.actorId === actorId &&
    preset.month === month &&
    (preset.orgUnitId === null || preset.orgUnitId === orgUnitId)
      ? preset
      : null;
  const refresh = () => client.invalidateQueries({ queryKey: scheduleKeys.all(accessKey) });
  const observedQuery = client
    .getQueryCache()
    .find({ queryKey: scheduleKeys.list(accessKey, listInput), exact: true });
  // QueryClient.clear() on logout removes the old instance, even if the same actor signs in again.
  const ownsResponse = () =>
    !!actorId &&
    !!observedQuery &&
    observedQuery.getObserversCount() > 0 &&
    observedQuery.meta?.['workspaceOwner'] === workspaceOwner &&
    client
      .getQueryCache()
      .find({ queryKey: scheduleKeys.list(accessKey, listInput), exact: true }) === observedQuery;
  const create = useMutation({
    mutationFn: ({ input }: { input: CreateScheduleVersionCommand; scope: string }) =>
      scheduleApi.create(input),
    onSuccess: async (created, variables) => {
      if (!ownsResponse()) return;
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
      const precondition = { expectedRevision: input.expectedRevision };
      const body = { ...precondition, items: gridToItems(input.grid) };
      switch (input.action) {
        case 'save':
          return scheduleApi.save(input.id, body);
        case 'revise':
          return scheduleApi.revise(input.id, {
            ...body,
            ...(input.reason ? { changeReason: input.reason } : {}),
          });
        case 'publish':
          return scheduleApi.publish(input.id, {
            ...precondition,
            ...(input.reason ? { changeReason: input.reason } : {}),
          });
        case 'submit':
          return scheduleApi.submit(input.id, precondition);
        case 'return':
          return scheduleApi.returnDraft(input.id, { ...precondition, comment: input.reason });
        case 'remove':
          return scheduleApi.remove(input.id, precondition);
      }
    },
    onSuccess: async (result, variables) => {
      if (!ownsResponse()) return;
      if (
        ['save', 'revise', 'remove'].includes(variables.action) &&
        useScheduleDrafts.getState().drafts[variables.draftKey] === variables.grid
      )
        useScheduleDrafts.getState().drop(variables.draftKey);
      if (variables.action === 'save' || variables.action === 'revise') clearSchedulePreset();
      if (result && 'version' in result)
        client.setQueryData<ScheduleVersionDetail>(
          scheduleKeys.detail(accessKey, result.version.id),
          (current) =>
            current && current.version.revision > result.version.revision ? current : result,
        );
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
    onError: async (error, variables) => {
      if (!ownsResponse()) return;
      if (error instanceof ApiError && error.code === 'SCHEDULE_REVISION_CONFLICT') {
        await client.invalidateQueries({ queryKey: scheduleKeys.detail(accessKey, variables.id) });
      }
    },
    retry: false,
  });
  const busy = create.isPending || write.isPending;
  const commandReady =
    !!actorId &&
    !!version &&
    version.revision > 0 &&
    !busy &&
    !stale &&
    !legacy &&
    !detailQuery.isError;
  const writable = !!editMode && commandReady;
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
    if (!actorId || busy || !rights.edit || !orgUnitId || !versionsQuery.isSuccess) return;
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
    if (writable && version && gridToItems(next).length <= 5000)
      store.keep(draftKey, next, baseline, version.revision);
  }
  function commit(action: Write['action'], reason = '', snapshot = grid) {
    if (!version || !commandReady || snapshot !== grid) return;
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
      write.mutate({
        id,
        draftKey,
        expectedRevision: store.revisions[draftKey] ?? version.revision,
        scope,
        grid: snapshot,
        action,
        reason,
      });
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
    accessKey,
    draftKey,
    unownedDraft,
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
      if (legacy && version && canEdit && !busy && detailQuery.isSuccess)
        store.restore(draftKey, grid, baseline, version.revision);
    },
    store,
    busy,
    writable,
    commandReady,
    editMode,
    templates: templatesQuery.data ?? [],
    error:
      create.error ??
      ((stale || !kept) &&
      write.error instanceof ApiError &&
      write.error.code === 'SCHEDULE_REVISION_CONFLICT'
        ? null
        : write.error),
    preset: presetHere,
    publicationBaseline: publishedQuery.data ? gridFromDetail(publishedQuery.data) : EMPTY_GRID,
    publicationReady: !published || publishedQuery.isSuccess,
    removeHistory(versionId: string) {
      const target = versions.find((value) => value.id === versionId);
      if (
        !!actorId &&
        !busy &&
        rights.edit &&
        target?.deletable &&
        target.revision > 0 &&
        target.status === 'SUPERSEDED'
      )
        write.mutate({
          id: versionId,
          draftKey: scheduleDraftKey(actorId, siteId, orgUnitId, month, versionId),
          expectedRevision: target.revision,
          scope,
          grid:
            store.drafts[scheduleDraftKey(actorId, siteId, orgUnitId, month, versionId)] ??
            EMPTY_GRID,
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
