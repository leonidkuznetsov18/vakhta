import type { ScheduleVersionView, ScheduleWebCommand } from '@vakhta/contracts';
import type { Messages } from '@vakhta/i18n';

type PlanVersion = Pick<ScheduleVersionView, 'status' | 'revision' | 'deletable'>;
interface PlanRights {
  readonly edit: boolean;
  readonly publish: boolean;
}
interface ReadState {
  readonly isSuccess: boolean;
  readonly isError: boolean;
}

export interface PlanAvailabilityInput {
  readonly actorId: string | null;
  readonly version: PlanVersion | undefined;
  readonly rights: PlanRights;
  readonly canEdit: boolean;
  readonly viewingPublished: boolean;
  readonly hasDraft: boolean;
  readonly stale: boolean;
  readonly legacy: boolean;
  readonly orgUnitId: string;
  readonly busy: boolean;
  readonly pendingCommand: Pick<ScheduleWebCommand, 'action'> | undefined;
  readonly recoveryError: boolean;
  readonly versionsQuery: ReadState;
  readonly detailQuery: ReadState;
}

/** Availability only: the workspace keeps ownership of queries, drafts and command dispatch. */
export function planAvailability(input: PlanAvailabilityInput, t: Messages['scheduleWorkspace']) {
  const {
    actorId,
    version,
    rights,
    canEdit,
    viewingPublished,
    hasDraft,
    stale,
    legacy,
    orgUnitId,
    busy,
    pendingCommand,
    recoveryError,
    versionsQuery,
    detailQuery,
  } = input;
  const commandsBlocked = busy || !!pendingCommand || recoveryError;
  const canRetryCommand =
    !!actorId &&
    !!pendingCommand &&
    !busy &&
    (['RETURN', 'PUBLISH', 'REVISE'].includes(pendingCommand.action)
      ? rights.publish
      : rights.edit);
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
  function readonlyReason(): string | null {
    if (writable) return null;
    if (viewingPublished) return t.viewingPublished;
    if (!version) return null;
    if (stale) return t.publishBlockedStale;
    if (legacy) return t.editBlockedLegacy;
    if (detailQuery.isError) return t.editBlockedRead;
    if (commandsBlocked) return t.publishBlockedBusy;
    if (version.status === 'IN_REVIEW') return t.editBlockedReview;
    if (version.status === 'PUBLISHED' && rights.edit && !rights.publish && hasDraft)
      return t.editBlockedDraftExists;
    if (!rights.edit && !rights.publish) return t.editBlockedRights;
    return null;
  }
  const canCreateDraft =
    !!actorId && !commandsBlocked && rights.edit && !!orgUnitId && versionsQuery.isSuccess;
  const canRestoreDraft =
    legacy && !!version && canEdit && !commandsBlocked && detailQuery.isSuccess;
  return {
    commandsBlocked,
    canRetryCommand,
    commandReady,
    canStartDraft,
    writable,
    readonlyReason: readonlyReason(),
    canCreateDraft,
    canRestoreDraft,
  };
}

interface PlanActionsInput {
  readonly version: PlanVersion | undefined;
  readonly rights: PlanRights;
  readonly canEdit: boolean;
  readonly writable: boolean;
  readonly commandReady: boolean;
  readonly changes: number;
  readonly items: number;
  readonly blocked: boolean;
}

/** The same action gates serve rendered controls and guarded command submission. */
export function allowedPlanActions(input: PlanActionsInput) {
  const { version, rights, canEdit, writable, commandReady, changes, items, blocked } = input;
  return {
    save: writable && canEdit && version?.status === 'DRAFT' && changes > 0 && !blocked,
    revise: writable && canEdit && version?.status === 'PUBLISHED' && changes > 0 && !blocked,
    publish:
      commandReady &&
      rights.publish &&
      version?.status === 'IN_REVIEW' &&
      changes === 0 &&
      !blocked,
    submit:
      commandReady &&
      rights.edit &&
      version?.status === 'DRAFT' &&
      changes === 0 &&
      items > 0 &&
      !blocked,
    return: commandReady && rights.publish && version?.status === 'IN_REVIEW' && changes === 0,
    remove: commandReady && rights.edit && !!version?.deletable && version.status === 'DRAFT',
  };
}
