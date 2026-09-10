import type { IncidentView } from '@vakhta/contracts';
import { isOpenIncident } from '@vakhta/domain';

type SlaIncident = Pick<
  IncidentView,
  'severity' | 'status' | 'openedAt' | 'slaDueAt' | 'acknowledgedAt' | 'resolvedAt' | 'slaBreached'
>;

export type IncidentSla =
  | { readonly kind: 'pending' }
  | { readonly kind: 'immediate'; readonly reactionMinutes: number | null }
  | { readonly kind: 'onTime' | 'late'; readonly minutes: number }
  | { readonly kind: 'notApplicable' | 'unknown' };

/** First recorded reaction freezes SLA; repair completion never replaces an earlier reaction. */
export function incidentSla(incident: SlaIncident): IncidentSla {
  const reaction = incident.acknowledgedAt ?? incident.resolvedAt;
  const elapsed = reaction
    ? Math.max(0, (Date.parse(reaction) - Date.parse(incident.openedAt)) / 60_000)
    : null;
  if (!reaction && !isOpenIncident(incident.status)) {
    return {
      kind:
        incident.status === 'REJECTED' || incident.status === 'DUPLICATE'
          ? 'notApplicable'
          : 'unknown',
    };
  }
  if (incident.severity === 'SAFETY') return { kind: 'immediate', reactionMinutes: elapsed };
  if (!reaction) return { kind: 'pending' };
  const late = (Date.parse(reaction) - Date.parse(incident.slaDueAt)) / 60_000;
  return late > 0 ? { kind: 'late', minutes: late } : { kind: 'onTime', minutes: elapsed ?? 0 };
}

/** Historical breaches stay in statistics, not in the visual queue awaiting a master's reaction. */
export function incidentNeedsReaction(incident: SlaIncident): boolean {
  return (
    isOpenIncident(incident.status) &&
    !incident.acknowledgedAt &&
    !incident.resolvedAt &&
    (incident.severity === 'SAFETY' || incident.slaBreached)
  );
}
