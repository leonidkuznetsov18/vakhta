import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScheduleWebCommand, ScheduleVersionDetail } from '@vakhta/contracts';
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
import { capabilities, EMPTY_GRID, workingVersion } from './planning';
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
import { scheduleChain } from './chain';
import { useScheduleRoster } from './roster';
import { useStaffing } from './use-staffing';
import { planIssues, usePlanContext } from './use-eligibility';
import { workspaceFeedback } from './feedback';
import { PRESET_KEY, clearSchedulePreset, type SchedulePreset } from './preset';

const t = messages(currentLocale()).scheduleWorkspace;
type WriteAction = 'save' | 'revise' | 'publish' | 'submit' | 'return' | 'remove';
const MAX_ITEMS = 5000;

/**
 * One working plan per unit and month: the unpublished draft when one exists, otherwise the
 * published schedule. Server snapshots and local edits have separate ownership; filters never
 * trim write payloads. Versions remain a server-side storage and audit concept only.
 */
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
  const rights = capabilities(
    grants,
    siteId,
    orgUnitId,
    zones.map((zone) => zone.id),
  );
  const [publishedView, setPublishedView] = useState<{ scope: string; value: boolean } | null>(
    null,
  );
  // A planner's first edit of a published month starts a draft; the edit waits for its identity.
  const [deferred, setDeferred] = useState<{
    scope: string;
    grid: GridState;
    baseline: GridState;
  } | null>(null);
  const listInput = { siteId, orgUnitId, periodMonth: month };
  const versionsQuery = useQuery({
    queryKey: scheduleKeys.list(accessKey, listInput),
    meta: { workspaceOwner },
    queryFn: ({ signal }) => scheduleApi.list(listInput, signal),
    enabled: !!actorId && !!siteId && !!orgUnitId,
  });
  const staffing = useStaffing({ accessKey, siteId, orgUnitId, enabled: !!actorId });
  const contextQuery = usePlanContext({ accessKey, siteId, orgUnitId, month, enabled: !!actorId });
  const templatesQuery = useQuery({
    queryKey: scheduleKeys.templates(accessKey, siteId),
    queryFn: ({ signal }) => scheduleApi.templates(siteId, signal),
    enabled: !!actorId && !!siteId,
  });
  const versions = versionsQuery.data ?? [];
  const working = workingVersion(versions, rights);
  const published = versions.find((v) => v.status === 'PUBLISHED');
  const hasDraft = !!working && !!published && working.id !== published.id;
  const viewingPublished =
    hasDraft && publishedView?.scope === scope && publishedView.value && !!published;
  const selected = viewingPublished ? published : working;
  const id = selected?.id ?? '';
  const detailQuery = useQuery({
    queryKey: scheduleKeys.detail(accessKey, id),
    queryFn: ({ signal }) => scheduleApi.detail(id, signal),
    enabled: !!actorId && !!id,
  });
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
    !viewingPublished &&
    ((version.status === 'DRAFT' && rights.edit) ||
      (version.status === 'PUBLISHED' && rights.publish));
  const grid = canEdit ? localGrid : baseline;
  const readOnlyChanges = !canEdit && (changes > 0 || legacy);
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
      if (result.kind === 'VERSION' && command.action === 'CREATE') {
        setPublishedView(null);
        if (deferred?.scope === scope) {
          if (result.version.revision > 0)
            useScheduleDrafts
              .getState()
              .keep(
                scheduleDraftKey(actorId, siteId, orgUnitId, month, result.version.id),
                deferred.grid,
                deferred.baseline,
                result.version.revision,
              );
          setDeferred(null);
        }
      }
      await scheduleCommands.getState().complete(commandScope, command.commandId);
      if (!ownsResponse()) return;
      const chained = scheduleChain.getState().take(commandScope);
      if (
        chained &&
        command.action === 'SUBMIT' &&
        result.kind === 'VERSION' &&
        result.version.status === 'IN_REVIEW' &&
        result.version.revision > 0
      ) {
        const follow = await scheduleCommands.getState().enqueue(commandScope, {
          commandId: crypto.randomUUID(),
          action: 'PUBLISH',
          versionId: result.version.id,
          expectedRevision: result.version.revision,
          payload: chained.changeReason ? { changeReason: chained.changeReason } : {},
        });
        if (follow && ownsResponse()) {
          write.mutate(follow);
          return;
        }
      }
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
      scheduleChain.getState().clear(commandScope);
      if (!ownsResponse()) return;
      if (command.action === 'CREATE') setDeferred(null);
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
  // A planner cannot revise a published month directly: the first edit starts a draft copy.
  const canStartDraft =
    !!actorId &&
    !!version &&
    version.status === 'PUBLISHED' &&
    !viewingPublished &&
    rights.edit &&
    !rights.publish &&
    versionsQuery.isSuccess &&
    !hasDraft;
  const writable = (canEdit || canStartDraft) && commandReady;
  /** Why the plan cannot be edited right now, in the planner's words; null when writable. */
  const readonlyReason: string | null = writable
    ? null
    : viewingPublished
      ? t.viewingPublished
      : !version
        ? null
        : stale
          ? t.publishBlockedStale
          : legacy
            ? t.editBlockedLegacy
            : detailQuery.isError
              ? t.editBlockedRead
              : busy || pendingCommand || commandQueue.recoveryError
                ? t.publishBlockedBusy
                : version.status === 'IN_REVIEW'
                  ? t.editBlockedReview
                  : version.status === 'PUBLISHED' && rights.edit && !rights.publish && hasDraft
                    ? t.editBlockedDraftExists
                    : !rights.edit && !rights.publish
                      ? t.editBlockedRights
                      : null;
  const canCreateDraft =
    !!actorId && !commandsBlocked && rights.edit && !!orgUnitId && versionsQuery.isSuccess;
  const canRestoreDraft =
    legacy && !!version && canEdit && !commandsBlocked && detailQuery.isSuccess;
  function createDraft() {
    if (!canCreateDraft) return;
    if (versions.some((value) => value.status === 'DRAFT')) return;
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
    if (!writable || !version || gridToItems(next).length > MAX_ITEMS) return;
    // A failed write describes the plan as it was; a new local change starts a new attempt.
    if (write.error) write.reset();
    if (canEdit) {
      store.keep(draftKey, next, baseline, version.revision);
      return;
    }
    if (!canStartDraft || !published) return;
    setDeferred({ scope, grid: next, baseline });
    dispatch({
      commandId: crypto.randomUUID(),
      action: 'CREATE',
      payload: { siteId, orgUnitId, periodMonth: month, basedOnVersionId: published.id },
    });
  }
  const items = gridToItems(grid).length;
  const timezone = org?.sites.find((site) => site.id === siteId)?.timezone ?? 'UTC';
  // Blocking rule conflicts stop saving and publication; the server re-evaluates at commit.
  const issues = planIssues({
    grid,
    month,
    orgUnitId,
    templates: templatesQuery.data ?? [],
    timezone,
    staffing: staffing.data,
    context: contextQuery.data,
  });
  const allowed = {
    save: writable && canEdit && version?.status === 'DRAFT' && changes > 0 && !issues.blocked,
    revise:
      writable && canEdit && version?.status === 'PUBLISHED' && changes > 0 && !issues.blocked,
    publish:
      commandReady &&
      rights.publish &&
      version?.status === 'IN_REVIEW' &&
      changes === 0 &&
      !issues.blocked,
    submit:
      commandReady &&
      rights.edit &&
      version?.status === 'DRAFT' &&
      changes === 0 &&
      items > 0 &&
      !issues.blocked,
    return: commandReady && rights.publish && version?.status === 'IN_REVIEW' && changes === 0,
    remove: commandReady && rights.edit && !!version?.deletable && version.status === 'DRAFT',
  };
  function commit(action: WriteAction, reason = '', snapshot = grid) {
    if (!version || !commandReady || snapshot !== grid) return;
    if (action === 'return' && reason.trim().length < 3) return;
    if (!allowed[action]) return;
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
  /** Approve-and-publish a saved draft in one step: submit, then publish the reviewed version. */
  const canPublishDraft = allowed.submit && rights.publish;
  function publishDraft(reason = '') {
    if (!canPublishDraft) return;
    scheduleChain.getState().plan(commandScope, { action: 'PUBLISH', changeReason: reason });
    commit('submit');
  }
  function resetSelection() {
    setPublishedView(null);
    setDeferred(null);
  }
  const feedback = workspaceFeedback([
    { query: orgResult.queryState },
    ...(actorId && siteId && orgUnitId ? [{ query: versionsQuery }] : []),
    ...(actorId && siteId ? [{ query: templatesQuery }] : []),
    ...(canReadEmployees
      ? [{ query: employeeResult.queryState, errorMessage: t.rosterUnavailable }]
      : []),
    ...(actorId && id ? [{ query: detailQuery }] : []),
    ...(actorId && siteId && orgUnitId
      ? [
          { query: staffing.query, errorMessage: t.staffingUnavailable },
          { query: contextQuery, errorMessage: t.contextUnavailable },
        ]
      : []),
    ...(canReadEmployees && employeeResult.loaded
      ? extraQueries.map((query) => ({ query, errorMessage: t.namesUnavailable }))
      : []),
  ]);
  const publicationBaseline = publishedQuery.data
    ? gridFromDetail(publishedQuery.data)
    : EMPTY_GRID;
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
    hasDraft,
    viewingPublished,
    showPublished(value: boolean) {
      if (busy || !hasDraft) return;
      setPublishedView({ scope, value });
    },
    grid,
    baseline,
    changes,
    /** Differences between the working plan (including local edits) and the published month. */
    unpublished:
      published && publishedQuery.isSuccess ? countChanges(publicationBaseline, grid) : items,
    stale,
    legacy,
    localGrid,
    readOnlyChanges,
    timezone,
    recorded: detail?.assignments ?? [],
    context: contextQuery.data,
    contextQuery,
    issues,
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
    readonlyReason,
    canEdit,
    canStartDraft,
    commandReady,
    allowed,
    canPublishDraft,
    publishDraft,
    templates: templatesQuery.data ?? [],
    staffing: staffing.data,
    staffingState: staffing,
    error:
      (stale || !kept) &&
      write.error instanceof ApiError &&
      write.error.code === 'SCHEDULE_REVISION_CONFLICT'
        ? null
        : write.error,
    preset: presetHere,
    publicationBaseline,
    publicationReady: !published || publishedQuery.isSuccess,
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
