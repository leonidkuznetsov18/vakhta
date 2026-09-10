import type { IncidentView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Deadline } from '@/components/app/deadline';
import { StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime, formatDuration } from '@/lib/format';
import { currentLocale } from '@/i18n';
import { incidentSla, type IncidentSla } from '../model/sla';

function presentation(state: IncidentSla): { label: string; tone: Tone; detail?: string } | null {
  const t = messages(currentLocale()).admin.incidents;
  switch (state.kind) {
    case 'pending':
      return null;
    case 'onTime':
      return {
        label: format(t.slaOnTime, { value: formatDuration(state.minutes) }),
        tone: 'success',
      };
    case 'late':
      return { label: format(t.slaLate, { value: formatDuration(state.minutes) }), tone: 'danger' };
    case 'immediate':
      return state.reactionMinutes === null
        ? { label: t.slaImmediate, tone: 'danger' }
        : {
            label: t.slaImmediate,
            tone: 'info',
            detail: format(t.slaReaction, { value: formatDuration(state.reactionMinutes) }),
          };
    case 'notApplicable':
      return { label: t.slaNotApplicable, tone: 'neutral' };
    case 'unknown':
      return { label: t.slaUnknown, tone: 'neutral' };
  }
}

export function IncidentSlaCell({ incident }: { readonly incident: IncidentView }) {
  const view = presentation(incidentSla(incident));
  return (
    <div className="flex max-w-72 min-w-0 flex-col items-start gap-1 whitespace-normal">
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatDateTime(incident.slaDueAt)}
      </span>
      {view ? (
        <StatusPill
          tone={view.tone}
          className="h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
        >
          {view.label}
        </StatusPill>
      ) : (
        <Deadline at={incident.slaDueAt} />
      )}
      {view?.detail && <span className="text-xs text-muted-foreground">{view.detail}</span>}
    </div>
  );
}
