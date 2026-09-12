import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduleWebCommand,
  ScheduleVersionView,
  ScheduleVersionDetail,
} from '@vakhta/contracts';
import { ApiError } from '@/api';
import { useOrg } from '@/lib/org';
import { usePersistentState } from '@/lib/ui-store';
import { useNavigation } from '@/navigation';
import {
  scheduleAccessKey,
  scheduleDraftKey,
  scheduleKeys,
  scheduleCommandScope,
} from './ownership';
import { notifySuccess } from '@/lib/toast';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { scheduleApi } from '../api/schedule-api';
import { capabilities, EMPTY_GRID, preferredVersion } from './planning';
import {
  countChanges,
  gridFromDetail,
  gridFromItems,
  gridToItems,
  restoreLegacyGrid,
  type GridState,
} from './grid';
import { useScheduleDrafts } from './store';
import { scheduleCommands, useScheduleCommands, commandWasRejected } from './commands';
import { useScheduleRoster } from './roster';
import { workspaceFeedback } from './feedback';
import { PRESET_KEY, clearSchedulePreset, type SchedulePreset } from './preset';

const t = messages(currentLocale()).scheduleWorkspace;
type Selection = { scope: string; id: string };
type WriteAction = 'save' | 'revise' | 'publish' | 'submit' | 'return' | 'remove';

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
  const commandScope = scheduleCommandScope(actorId, siteId, orgUnitId, month);
  const commandQueue = useScheduleCommands();
  const pendingCommand = commandQueue.pending[commandScope];
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
  const write = useMutation({
    mutationFn: (command: ScheduleWebCommand) => scheduleApi.execute(command),
    onSuccess: async (result, command) => {
      if (!ownsResponse()) return;
      if (command.action === 'SAVE' || command.action === 'REVISE') {
        const key = scheduleDraftKey(actorId, siteId, orgUnitId, month, command.versionId);
        const local = useScheduleDrafts.getState().drafts[key];
        if (
          local &&
          countChanges(local, gridFromItems(command.payload.items)) === 0 &&
          useScheduleDrafts.getState().revisions[key] === command.expectedRevision
        )
          useScheduleDrafts.getState().drop(key);
        clearSchedulePreset();
      }
      if (command.action === 'DELETE')
        useScheduleDrafts
          .getState()
          .drop(scheduleDraftKey(actorId, siteId, orgUnitId, month, command.versionId));
      if (result.kind === 'DETAIL')
        client.setQueryData<ScheduleVersionDetail>(
          scheduleKeys.detail(accessKey, result.detail.version.id),
          (current) =>
            current && current.version.revision > result.detail.version.revision
              ? current
              : result.detail,
        );
      if (result.kind === 'VERSION') {
        setPicked({ scope, id: result.version.id });
        if (command.action === 'CREATE') setEditing(result.version.id);
      }
      await scheduleCommands.getState().complete(commandScope, command.commandId);
      if (!ownsResponse()) return;
      notifySuccess(
        command.action === 'PUBLISH' || command.action === 'REVISE'
          ? t.success
          : command.action === 'SUBMIT'
            ? t.submitted
            : t.saved,
      );
      await refresh();
    },
    onError: async (error, command) => {
      if (!ownsResponse()) return;
      if (commandWasRejected(error))
        await scheduleCommands.getState().complete(commandScope, command.commandId);
      if (
        error instanceof ApiError &&
        error.code === 'SCHEDULE_REVISION_CONFLICT' &&
        command.action !== 'CREATE'
      )
        await client.invalidateQueries({
          queryKey: scheduleKeys.detail(accessKey, command.versionId),
        });
    },
    retry: false,
    networkMode: 'always',
  });
  const busy = write.isPending;
  const commandsBlocked = busy || !!pendingCommand || commandQueue.recoveryError;
  const canRetryCommand =
    !!actorId &&
    !!pendingCommand &&
    !busy &&
    (['RETURN', 'PUBLISH', 'REVISE'].includes(pendingCommand.action)
      ? rights.publish
      : rights.edit);
  async function dispatch(command: ScheduleWebCommand) {
    if (!actorId || busy) return;
    const queued = await scheduleCommands.getState().enqueue(commandScope, command);
    if (queued && ownsResponse()) write.mutate(queued);
  }
  const commandReady =
    !!actorId &&
    !!version &&
    version.revision > 0 &&
    !commandsBlocked &&
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
    if (commandsBlocked || !version || !canEdit) return;
    setPicked({ scope, id });
    setEditing(id);
  }
  const canCreateDraft =
    !!actorId && !commandsBlocked && rights.edit && !!orgUnitId && versionsQuery.isSuccess;
  const canRestoreDraft =
    legacy && !!version && canEdit && !commandsBlocked && detailQuery.isSuccess;
  function createDraft() {
    if (!canCreateDraft) return;
    const draft = versions.find((value) => value.status === 'DRAFT');
    if (draft) {
      select(draft);
      setEditing(draft.id);
      return;
    }
    setPicked({ scope, id });
    dispatch({
      commandId: crypto.randomUUID(),
      action: 'CREATE',
      payload: {
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
  function commit(action: WriteAction, reason = '', snapshot = grid) {
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
      const common = {
        commandId: crypto.randomUUID(),
        versionId: id,
        expectedRevision: store.revisions[draftKey] ?? version.revision,
      };
      switch (action) {
        case 'save':
          dispatch({ ...common, action: 'SAVE', payload: { items: gridToItems(snapshot) } });
          break;
        case 'revise':
          dispatch({
            ...common,
            action: 'REVISE',
            payload: { items: gridToItems(snapshot), ...(reason ? { changeReason: reason } : {}) },
          });
          break;
        case 'publish':
          dispatch({
            ...common,
            action: 'PUBLISH',
            payload: reason ? { changeReason: reason } : {},
          });
          break;
        case 'submit':
          dispatch({ ...common, action: 'SUBMIT' });
          break;
        case 'return':
          dispatch({ ...common, action: 'RETURN', payload: { comment: reason } });
          break;
        case 'remove':
          dispatch({ ...common, action: 'DELETE' });
          break;
      }
    }
  }
  function resetSelection() {
    setPicked(null);
    setEditing(null);
  }
  const feedback = workspaceFeedback([
    { query: orgResult.queryState },
    ...(actorId && siteId && orgUnitId ? [{ query: versionsQuery }] : []),
    ...(actorId && siteId ? [{ query: templatesQuery }] : []),
    ...(canReadEmployees
      ? [{ query: employeeResult.queryState, errorMessage: t.rosterUnavailable }]
      : []),
    ...(actorId && id ? [{ query: detailQuery }] : []),
    ...(canReadEmployees && employeeResult.loaded
      ? extraQueries.map((query) => ({ query, errorMessage: t.namesUnavailable }))
      : []),
  ]);
  return {
    feedback,
    canCreateDraft,
    canRestoreDraft,
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
      if (canRestoreDraft && version) store.restore(draftKey, grid, baseline, version.revision);
    },
    store,
    busy,
    commandsBlocked,
    pendingCommand,
    canRetryCommand,
    commandStorageError: commandQueue.storageError || commandQueue.recoveryError,
    async retryCommand() {
      if (!canRetryCommand || !pendingCommand) return;
      const pending = await scheduleCommands
        .getState()
        .recover(commandScope, pendingCommand.commandId);
      if (pending && ownsResponse()) write.mutate(pending);
    },
    writable,
    commandReady,
    editMode,
    templates: templatesQuery.data ?? [],
    error:
      (stale || !kept) &&
      write.error instanceof ApiError &&
      write.error.code === 'SCHEDULE_REVISION_CONFLICT'
        ? null
        : write.error,
    preset: presetHere,
    publicationBaseline: publishedQuery.data ? gridFromDetail(publishedQuery.data) : EMPTY_GRID,
    publicationReady: !published || publishedQuery.isSuccess,
    removeHistory(versionId: string) {
      const target = versions.find((value) => value.id === versionId);
      if (
        !!actorId &&
        !commandsBlocked &&
        rights.edit &&
        target?.deletable &&
        target.revision > 0 &&
        target.status === 'SUPERSEDED'
      )
        dispatch({
          commandId: crypto.randomUUID(),
          action: 'DELETE',
          versionId,
          expectedRevision: target.revision,
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
