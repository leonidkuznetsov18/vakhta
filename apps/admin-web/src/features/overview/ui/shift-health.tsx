import type { OverviewSnapshot } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { ActivityIcon, ClipboardCheckIcon, TimerIcon, UsersIcon } from 'lucide-react';
import { KpiTile } from '@/components/app/kpi-tile';
import { Section } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import { overviewText } from '../model/time';

export type HealthTarget = 'staffing' | 'timeToAction' | 'downtime' | 'handover' | 'schedule';

/**
 * "Shift health" (spec 004 US4): four facts of the current shift with their numerators and
 * denominators. A section the reader cannot read is left out; a loading or failed snapshot shows
 * the loader or retry in place of every number.
 */
export function ShiftHealth({
  snapshot,
  state,
  onOpen,
  onRetry,
}: {
  readonly snapshot: OverviewSnapshot | undefined;
  readonly state: 'ready' | 'loading' | 'failed';
  readonly onOpen: (target: HealthTarget) => void;
  readonly onRetry: () => void;
}) {
  const c = overviewText();
  const failure = (
    <Button type="button" size="sm" variant="outline" onClick={onRetry}>
      {c.retry}
    </Button>
  );
  const tileState = snapshot ? 'ready' : state;
  const s = snapshot?.staffing;
  const t = snapshot?.timeToAction;
  const d = snapshot?.downtime;
  const h = snapshot?.handover;
  const show = (section: unknown) => !snapshot || section !== null;
  return (
    <Section title={c.healthTitle} hint={c.healthHint}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {show(s) && (
          <KpiTile
            icon={UsersIcon}
            title={c.staffing}
            hint={c.staffingHint}
            state={tileState}
            failure={failure}
            tone={s && s.notArrived > 0 ? 'warning' : 'neutral'}
            value={
              s && s.planned > 0
                ? format(c.staffingValue, { present: s.present, planned: s.planned })
                : c.noPlan
            }
            details={
              s && s.planned > 0
                ? [
                    format(c.notArrivedCount, { count: s.notArrived }),
                    format(c.expectedCount, { count: s.expected }),
                    ...(s.unscheduled > 0
                      ? [format(c.unscheduledCount, { count: s.unscheduled })]
                      : []),
                  ]
                : s && s.unscheduled > 0
                  ? [format(c.unscheduledCount, { count: s.unscheduled })]
                  : []
            }
            onOpen={() => onOpen(s && s.planned === 0 ? 'schedule' : 'staffing')}
            openLabel={s && s.planned === 0 ? c.openSchedule : c.staffing}
          />
        )}
        {show(t) && (
          <KpiTile
            icon={TimerIcon}
            title={c.timeToAction}
            hint={c.timeToActionHint}
            state={tileState}
            failure={failure}
            tone={
              t && t.awaitingBreached > 0 ? 'danger' : t && t.slaMissed > 0 ? 'warning' : 'neutral'
            }
            value={
              t && t.reported > 0
                ? t.medianMinutes === null
                  ? format(c.awaitingReaction, { count: t.awaiting })
                  : format(c.medianValue, { duration: formatDuration(t.medianMinutes) })
                : c.noIncidents
            }
            details={
              t && t.reported > 0
                ? [
                    format(c.slaMet, { met: t.slaMet, total: t.slaMet + t.slaMissed }),
                    format(c.awaitingReaction, { count: t.awaiting }),
                  ]
                : []
            }
            onOpen={() => onOpen('timeToAction')}
            openLabel={c.timeToAction}
          />
        )}
        {show(d) && (
          <KpiTile
            icon={ActivityIcon}
            title={c.downtime}
            hint={c.downtimeHint}
            state={tileState}
            failure={failure}
            tone={d && d.zoneMinutes > 0 ? 'warning' : 'neutral'}
            value={
              d && (d.zoneMinutes > 0 || d.incidents > 0)
                ? formatDuration(d.zoneMinutes)
                : c.noDowntime
            }
            details={
              d && (d.zoneMinutes > 0 || d.incidents > 0)
                ? [
                    format(c.personMinutes, { duration: formatDuration(d.personMinutes) }),
                    format(c.incidentsCount, { count: d.incidents }),
                    ...(d.topReason ? [format(c.topReason, { reason: d.topReason.label })] : []),
                  ]
                : []
            }
            onOpen={() => onOpen('downtime')}
            openLabel={c.downtime}
          />
        )}
        {show(h) && (
          <KpiTile
            icon={ClipboardCheckIcon}
            title={c.handover}
            hint={c.handoverHint}
            state={tileState}
            failure={failure}
            tone={h && h.disputed > 0 ? 'warning' : 'neutral'}
            value={
              h && h.decided > 0
                ? format(c.handoverValue, { clean: h.clean, decided: h.decided })
                : c.noHandover
            }
            details={
              h && (h.decided > 0 || h.pending > 0)
                ? [
                    format(c.disputedCount, { count: h.disputed }),
                    format(c.pendingCount, { count: h.pending }),
                  ]
                : []
            }
            onOpen={() => onOpen('handover')}
            openLabel={c.handover}
          />
        )}
      </div>
    </Section>
  );
}
