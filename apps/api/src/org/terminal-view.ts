import type { TerminalView } from '@vakhta/contracts';
import { terminalConnectivity } from '@vakhta/domain';
import { currentSettings } from '../infra/tenant-context.js';

export interface TerminalRow {
  readonly id: string;
  readonly siteId: string;
  readonly name: string;
  readonly checkpoint: TerminalView['checkpoint'];
  readonly status: TerminalView['status'];
  readonly deviceTokenHash: string | null;
  readonly lastSeenAt: Date | null;
}

/** Connectivity uses the Overview rule, so the two screens never disagree about a terminal. */
export function terminalView(row: TerminalRow, now = new Date()): TerminalView {
  const paired = row.deviceTokenHash !== null;
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    checkpoint: row.checkpoint,
    status: row.status,
    paired,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    connectivity: terminalConnectivity(
      { status: row.status, paired, lastSeenAt: row.lastSeenAt },
      now,
      currentSettings().qrRotationSeconds,
    ),
  };
}
