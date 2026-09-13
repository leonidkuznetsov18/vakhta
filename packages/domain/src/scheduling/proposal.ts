import type { EligibilityReason } from './eligibility.js';

/**
 * Reviewed allocation proposal (SC-45): suggests one person per open slot from an explicit cohort.
 * Hard constraints are filtered before ranking; the plan is evaluated as a whole, so a person
 * suggested for one slot is counted when the next slot is ranked. Unresolved slots stay explicit
 * with a reason. The result is a diff for a human to edit, accept or reject; it never publishes.
 */

export interface ProposalSlot {
  readonly slotId: string;
  readonly businessDate: string;
  readonly templateId: string;
  readonly zoneId: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface ProposalPerson {
  readonly employeeId: string;
  /** Planned minutes in the period before the proposal, for balancing. */
  readonly plannedMinutes: number;
  readonly ownUnit: boolean;
}

export interface ProposalPreferences {
  /** Rank people of the slot's unit before borrowed people. */
  readonly preferOwnUnit: boolean;
  /** Rank people with fewer planned minutes first. */
  readonly balanceHours: boolean;
}

export interface ProposalEvaluation {
  readonly blocked: boolean;
  readonly reasons: readonly EligibilityReason[];
}

export interface ProposalPick {
  readonly slotId: string;
  readonly employeeId: string;
  readonly warnings: readonly EligibilityReason[];
  /** How many eligible people competed for the slot. */
  readonly alternatives: number;
}

export type UnresolvedReason = 'NO_PEOPLE' | 'ALL_BLOCKED';

export interface ProposalResult {
  readonly picks: ProposalPick[];
  readonly unresolved: { readonly slotId: string; readonly reason: UnresolvedReason }[];
  readonly scope: {
    readonly slots: number;
    readonly people: number;
    readonly dates: readonly string[];
    readonly preferences: ProposalPreferences;
  };
}

export function proposeAllocation(input: {
  readonly slots: readonly ProposalSlot[];
  readonly people: readonly ProposalPerson[];
  readonly preferences: ProposalPreferences;
  /** Evaluates one person on one slot against the plan including earlier picks. */
  readonly evaluate: (
    employeeId: string,
    slot: ProposalSlot,
    picks: readonly ProposalPick[],
  ) => ProposalEvaluation;
}): ProposalResult {
  const picks: ProposalPick[] = [];
  const unresolved: ProposalResult['unresolved'] = [];
  const minutes = new Map(input.people.map((person) => [person.employeeId, person.plannedMinutes]));
  const slots = [...input.slots].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || a.startMs - b.startMs,
  );
  for (const slot of slots) {
    if (input.people.length === 0) {
      unresolved.push({ slotId: slot.slotId, reason: 'NO_PEOPLE' });
      continue;
    }
    const takenToday = new Set(
      picks
        .filter(
          (pick) => slots.find((s) => s.slotId === pick.slotId)?.businessDate === slot.businessDate,
        )
        .map((pick) => pick.employeeId),
    );
    const eligible = input.people
      .filter((person) => !takenToday.has(person.employeeId))
      .map((person) => ({ person, evaluation: input.evaluate(person.employeeId, slot, picks) }))
      .filter(({ evaluation }) => !evaluation.blocked);
    if (eligible.length === 0) {
      unresolved.push({ slotId: slot.slotId, reason: 'ALL_BLOCKED' });
      continue;
    }
    eligible.sort((a, b) => {
      const warnings = a.evaluation.reasons.length - b.evaluation.reasons.length;
      if (warnings !== 0) return warnings;
      if (input.preferences.preferOwnUnit && a.person.ownUnit !== b.person.ownUnit)
        return a.person.ownUnit ? -1 : 1;
      if (input.preferences.balanceHours) {
        const load =
          (minutes.get(a.person.employeeId) ?? 0) - (minutes.get(b.person.employeeId) ?? 0);
        if (load !== 0) return load;
      }
      return a.person.employeeId.localeCompare(b.person.employeeId);
    });
    const best = eligible[0]!;
    picks.push({
      slotId: slot.slotId,
      employeeId: best.person.employeeId,
      warnings: best.evaluation.reasons,
      alternatives: eligible.length,
    });
    minutes.set(
      best.person.employeeId,
      (minutes.get(best.person.employeeId) ?? 0) + (slot.endMs - slot.startMs) / 60_000,
    );
  }
  return {
    picks,
    unresolved,
    scope: {
      slots: input.slots.length,
      people: input.people.length,
      dates: [...new Set(input.slots.map((slot) => slot.businessDate))].sort(),
      preferences: input.preferences,
    },
  };
}
