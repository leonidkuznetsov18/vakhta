import type { OverviewZone, ZoneStatusCode } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { WrenchIcon } from 'lucide-react';
import { EmptyState, Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { usePersistentState } from '@/lib/ui-store';
import { PeopleLine } from '@/components/app/avatar-stack';
import { stacked, type Faces } from '../model/people';
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
  stopped,
  now,
  faces,
  onOpen,
}: {
  readonly zones: readonly OverviewZone[];
  /** Stopped machine names by zone; empty when the reader cannot read maintenance. */
  readonly stopped: ReadonlyMap<string, readonly string[]>;
  readonly now: Date;
  readonly faces: Faces;
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
                <ZoneCard
                  zone={z}
                  stopped={stopped.get(z.zoneId) ?? []}
                  now={now}
                  faces={faces}
                  showUnit={multipleUnits}
                  onOpen={() => onOpen(z)}
                />
              </li>
            ))}
          </ul>
          {idle.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Muted>{format(c.idleZones, { count: idle.length })}</Muted>
              <Button
                type="button"
                size="sm"
                variant="outline"
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

/**
 * One zone: its state, then who is there and who of the plan is not, by face. The whole card opens
 * the zone; the button lies under the content so the avatar stacks stay reachable on their own.
 */
function ZoneCard({
  zone: z,
  stopped,
  now,
  faces,
  showUnit,
  onOpen,
}: {
  readonly zone: OverviewZone;
  readonly stopped: readonly string[];
  readonly now: Date;
  readonly faces: Faces;
  readonly showUnit: boolean;
  readonly onOpen: () => void;
}) {
  const c = overviewText();
  const showPresent = z.present > 0 || z.planned === 0;
  return (
    <div className="relative flex h-full min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60 has-[>button:active]:opacity-90">
      <button
        type="button"
        onClick={onOpen}
        aria-label={z.zoneName}
        className="absolute inset-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <StatusPill tone={STATUS_TONE[z.status]} className="self-start">
        {c.zoneStatus[z.status]}
        {z.since ? ` · ${formatAge(minutesBetween(z.since, now))}` : ''}
      </StatusPill>
      <span className="text-sm leading-snug font-medium break-words">{z.zoneName}</span>
      {showUnit && <Muted className="text-xs break-words">{z.orgUnitName}</Muted>}
      {stopped.length > 0 && (
        <span className="inline-flex items-start gap-1 text-xs font-medium break-words text-red-700 dark:text-red-300">
          <WrenchIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {format(c.zoneStopped, { names: stopped.join(', ') })}
        </span>
      )}
      <span className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
        {z.planned > 0 && (
          <span>{format(c.zonePeople, { present: z.present, planned: z.planned })}</span>
        )}
        {showPresent && (
          <PeopleLine
            label={format(c.presentCount, { count: z.present })}
            people={stacked(z.presentPeople, faces)}
          />
        )}
        {z.missingPeople.length > 0 && (
          <PeopleLine
            label={format(c.zoneMissingCount, { count: z.missingPeople.length })}
            people={stacked(z.missingPeople, faces)}
          />
        )}
      </span>
    </div>
  );
}
