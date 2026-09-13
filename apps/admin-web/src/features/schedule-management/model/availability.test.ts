import { describe, expect, it } from 'vitest';
import { messages } from '@vakhta/i18n';
import { allowedPlanActions, planAvailability, type PlanAvailabilityInput } from './availability';

const t = messages('en').scheduleWorkspace;
const ready = { isSuccess: true, isError: false };
const base: PlanAvailabilityInput = {
  actorId: 'planner',
  version: { status: 'DRAFT', revision: 1, deletable: true },
  rights: { edit: true, publish: false },
  canEdit: true,
  viewingPublished: false,
  hasDraft: false,
  stale: false,
  legacy: false,
  orgUnitId: 'unit',
  busy: false,
  pendingCommand: undefined,
  recoveryError: false,
  versionsQuery: ready,
  detailQuery: ready,
};

describe('plan availability', () => {
  it('keeps the most useful read-only reason when blockers overlap', () => {
    const blocked = {
      ...base,
      stale: true,
      legacy: true,
      busy: true,
      detailQuery: { isSuccess: false, isError: true },
    };
    expect(planAvailability({ ...blocked, viewingPublished: true }, t).readonlyReason).toBe(
      t.viewingPublished,
    );
    expect(planAvailability(blocked, t).readonlyReason).toBe(t.publishBlockedStale);
    expect(planAvailability({ ...blocked, stale: false }, t).readonlyReason).toBe(
      t.editBlockedLegacy,
    );
    expect(planAvailability({ ...blocked, stale: false, legacy: false }, t).readonlyReason).toBe(
      t.editBlockedRead,
    );
    expect(planAvailability({ ...base, busy: true }, t).readonlyReason).toBe(t.publishBlockedBusy);
    expect(planAvailability({ ...blocked, version: undefined }, t).readonlyReason).toBeNull();
  });

  it('starts a planner draft from a published month only after reading all versions', () => {
    const published = {
      ...base,
      canEdit: false,
      version: { status: 'PUBLISHED' as const, revision: 2, deletable: false },
    };
    expect(planAvailability(published, t)).toMatchObject({ canStartDraft: true, writable: true });
    expect(planAvailability({ ...published, hasDraft: true }, t)).toMatchObject({
      canStartDraft: false,
      writable: false,
      readonlyReason: t.editBlockedDraftExists,
    });
    expect(
      planAvailability({ ...published, versionsQuery: { isSuccess: false, isError: true } }, t),
    ).toMatchObject({ canStartDraft: false, canCreateDraft: false, writable: false });
  });

  it('retains legacy restoration without allowing a write until recovery completes', () => {
    expect(planAvailability({ ...base, legacy: true }, t)).toMatchObject({
      writable: false,
      commandReady: false,
      canRestoreDraft: true,
    });
    expect(planAvailability({ ...base, legacy: true, recoveryError: true }, t)).toMatchObject({
      commandsBlocked: true,
      canRestoreDraft: false,
      canCreateDraft: false,
    });
    expect(
      planAvailability({ ...base, version: { status: 'DRAFT', revision: 0, deletable: true } }, t),
    ).toMatchObject({ commandReady: false, writable: false });
  });

  it.each(['CREATE', 'SAVE', 'SUBMIT', 'DELETE', 'RETURN', 'PUBLISH', 'REVISE'] as const)(
    'retries %s only with the original action authority',
    (action) => {
      const input = { ...base, pendingCommand: { action } };
      const needsPublisher = ['RETURN', 'PUBLISH', 'REVISE'].includes(action);
      expect(planAvailability(input, t).canRetryCommand).toBe(!needsPublisher);
      expect(
        planAvailability({ ...input, rights: { edit: false, publish: true } }, t).canRetryCommand,
      ).toBe(needsPublisher);
      expect(planAvailability({ ...input, busy: true }, t).canRetryCommand).toBe(false);
      expect(planAvailability({ ...input, actorId: null }, t).canRetryCommand).toBe(false);
      expect(planAvailability(input, t).commandReady).toBe(false);
    },
  );
});

it('keeps unsaved changes out of review and leaves removal available for blocked drafts', () => {
  const input = {
    version: base.version,
    rights: base.rights,
    canEdit: true,
    writable: true,
    commandReady: true,
    changes: 1,
    items: 2,
    blocked: false,
  };
  expect(allowedPlanActions(input)).toEqual({
    save: true,
    revise: false,
    submit: false,
    publish: false,
    return: false,
    remove: true,
  });
  expect(allowedPlanActions({ ...input, changes: 0 })).toMatchObject({ save: false, submit: true });
  expect(allowedPlanActions({ ...input, changes: 0, items: 0 }).submit).toBe(false);
  expect(allowedPlanActions({ ...input, blocked: true })).toMatchObject({
    save: false,
    remove: true,
  });
  expect(
    allowedPlanActions({
      ...input,
      version: { status: 'IN_REVIEW', revision: 2, deletable: false },
      changes: 0,
      rights: { edit: false, publish: true },
      blocked: true,
    }),
  ).toMatchObject({ publish: false, return: true });
});
