export const TerminalConnectivity = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  UNPAIRED: 'UNPAIRED',
  DISABLED: 'DISABLED',
} as const;
export type TerminalConnectivity = (typeof TerminalConnectivity)[keyof typeof TerminalConnectivity];

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
  if (terminal.status !== 'ACTIVE') return TerminalConnectivity.DISABLED;
  if (!terminal.paired) return TerminalConnectivity.UNPAIRED;
  if (!terminal.lastSeenAt) return TerminalConnectivity.OFFLINE;
  const silenceMs = now.getTime() - terminal.lastSeenAt.getTime();
  const silent = silenceMs > OFFLINE_ROTATIONS * rotationSeconds * 1000;
  return silent ? TerminalConnectivity.OFFLINE : TerminalConnectivity.ONLINE;
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
