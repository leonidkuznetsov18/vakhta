import type { OverviewZone, ZoneStatusCode } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { EmptyState, Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { usePersistentState } from '@/lib/ui-store';
import { formatAge, minutesBetween, overviewText } from '../model/time';

const STATUS_TONE: Record<ZoneStatusCode, Tone> = {
  DOWNTIME: 'danger',
  UNSTAFFED: 'danger',
  UNDERSTAFFED: 'warning',
  CLOSING: 'neutral',
  WORKING: 'success',
  IDLE: 'neutral',
};

/**
 * "Zones now" (spec 004 US6): the state of every workplace, problems first. Idle zones with neither
 * a plan nor people fold under one line so a large site does not push the page into scrolling.
 */
export function ZoneBoard({
  zones,
  now,
  onOpen,
}: {
  readonly zones: readonly OverviewZone[];
  readonly now: Date;
  readonly onOpen: (zone: OverviewZone) => void;
}) {
  const c = overviewText();
  const [showIdle, setShowIdle] = usePersistentState('overview.showIdleZones', false);
  const active = zones.filter((z) => z.status !== 'IDLE');
  const idle = zones.filter((z) => z.status === 'IDLE');
  const visible = showIdle ? zones : active;
  const multipleUnits = new Set(zones.map((z) => z.orgUnitId)).size > 1;
  return (
    <Section title={c.zonesTitle} hint={c.zonesHint}>
      {zones.length === 0 ? (
        <EmptyState text={c.noZones} />
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {visible.map((z) => (
              <li key={z.zoneId} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(z)}
                  className="flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-90"
                >
                  <StatusPill tone={STATUS_TONE[z.status]} className="self-start">
                    {c.zoneStatus[z.status]}
                    {z.since ? ` · ${formatAge(minutesBetween(z.since, now))}` : ''}
                  </StatusPill>
                  <span className="text-sm leading-snug font-medium break-words">{z.zoneName}</span>
                  {multipleUnits && <Muted className="text-xs break-words">{z.orgUnitName}</Muted>}
                  <span className="mt-auto text-xs text-muted-foreground tabular-nums">
                    {z.planned > 0
                      ? format(c.zonePeople, { present: z.present, planned: z.planned })
                      : format(c.zonePeopleUnplanned, { present: z.present })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {idle.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Muted>{format(c.idleZones, { count: idle.length })}</Muted>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={showIdle}
                onClick={() => setShowIdle((v) => !v)}
              >
                {showIdle ? c.hideIdle : c.showIdle}
              </Button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
