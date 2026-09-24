import type { EquipmentDetail } from '@vakhta/contracts';
import { EquipmentState } from '@vakhta/domain';

const MINUTE_MS = 60_000;

/** Minutes the machine has stood still in the open stop episode; null when it runs. */
export function downtimeMinutes(machine: EquipmentDetail, now: Date): number | null {
  if (!machine.openStop) return null;
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(machine.openStop.startedAt)) / MINUTE_MS),
  );
}

/** What the responder may do with the machine now (FR-065, FR-066). */
export const ResponderActionKind = {
  NONE: 'NONE',
  CREATE_EMERGENCY: 'CREATE_EMERGENCY',
  RELEASE: 'RELEASE',
} as const;

export type ResponderAction =
  | { readonly kind: typeof ResponderActionKind.NONE }
  | { readonly kind: typeof ResponderActionKind.CREATE_EMERGENCY }
  | { readonly kind: typeof ResponderActionKind.RELEASE; readonly ready: boolean };

export function responderAction(machine: EquipmentDetail): ResponderAction {
  const stopped = machine.openStop !== null || machine.state !== EquipmentState.AVAILABLE;
  if (stopped)
    return { kind: ResponderActionKind.RELEASE, ready: machine.activeEmergency === null };
  if (machine.activeEmergency) return { kind: ResponderActionKind.NONE };
  return { kind: ResponderActionKind.CREATE_EMERGENCY };
}

/** Which dialog of the card is open. */
export const CardDialog = { NONE: 'NONE', EMERGENCY: 'EMERGENCY', RELEASE: 'RELEASE' } as const;
export type CardDialog = (typeof CardDialog)[keyof typeof CardDialog];
