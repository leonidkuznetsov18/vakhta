import { Month } from '@vakhta/contracts';
import type {
  AcknowledgementScope,
  AcknowledgementSnapshot,
} from '../scheduling/acknowledgement-snapshot.js';

export function acknowledgementCallback(snapshot: AcknowledgementSnapshot): string | null {
  if (!snapshot.pending) return null;
  const scope = snapshot.scope.kind === 'HOME' ? 'h' : `m:${snapshot.scope.month}`;
  return `ack2:${scope}:${snapshot.fingerprint}`;
}

export function parseAcknowledgementCallback(
  data: string,
): { scope: AcknowledgementScope; fingerprint: string } | null {
  const match = /^ack2:(h|m:(\d{4}-\d{2})):([A-Za-z0-9_-]{43})$/.exec(data);
  if (!match?.[3]) return null;
  if (match[1] === 'h') return { scope: { kind: 'HOME' }, fingerprint: match[3] };
  const month = Month.safeParse(match[2]);
  return month.success
    ? { scope: { kind: 'MONTH', month: month.data }, fingerprint: match[3] }
    : null;
}
