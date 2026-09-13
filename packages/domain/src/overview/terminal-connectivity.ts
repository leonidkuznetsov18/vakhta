export type TerminalConnectivity = 'ONLINE' | 'OFFLINE' | 'UNPAIRED' | 'DISABLED';

export interface TerminalHeartbeat {
  readonly status: string;
  readonly paired: boolean;
  readonly lastSeenAt: Date | null;
}

/** Missed QR renewals that make a paired kiosk offline (spec 004 D-04). */
export const OFFLINE_ROTATIONS = 3;

/**
 * A paired kiosk renews its QR challenge every rotation and updates `lastSeenAt` each time, so a
 * silence longer than three rotations means attendance cannot be recorded there.
 */
export function terminalConnectivity(
  terminal: TerminalHeartbeat,
  now: Date,
  rotationSeconds: number,
): TerminalConnectivity {
  if (terminal.status !== 'ACTIVE') return 'DISABLED';
  if (!terminal.paired) return 'UNPAIRED';
  if (!terminal.lastSeenAt) return 'OFFLINE';
  const silenceMs = now.getTime() - terminal.lastSeenAt.getTime();
  return silenceMs > OFFLINE_ROTATIONS * rotationSeconds * 1000 ? 'OFFLINE' : 'ONLINE';
}

/**
 * An offline terminal is critical when people depend on it soon: a shift boundary within the
 * next hour (arrivals and departures) or planned staff not recorded yet.
 */
export function offlineTerminalIsCritical(input: {
  readonly now: Date;
  readonly nextBoundaryAt: Date | null;
  readonly notArrived: number;
}): boolean {
  if (input.notArrived > 0) return true;
  if (!input.nextBoundaryAt) return false;
  const until = input.nextBoundaryAt.getTime() - input.now.getTime();
  return until >= 0 && until <= 60 * 60_000;
}
