import type { OverviewSiteContext, OverviewSnapshot } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { CircleAlertIcon, Clock3Icon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, StatusPill } from '@/components/app/page';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { formatDuration, formatTime } from '@/lib/format';
import type { OverviewSelection } from '../model/destination';
import { businessDateLabel, minutesUntil, overviewText, siteTime } from '../model/time';

/**
 * The page header (spec 004 US2): which sites and units the page describes, which shift is running
 * there and how long it has left, whether the previous shift is still closing, and how fresh the
 * numbers are. The selector lists only what the reader's grants reach.
 */
export function ShiftHeader({
  snapshot,
  selection,
  onSelect,
  live,
  updatedAt,
  now,
  failed = false,
  onRetry,
}: {
  readonly snapshot: OverviewSnapshot | undefined;
  readonly selection: OverviewSelection;
  readonly onSelect: (next: OverviewSelection) => void;
  readonly live: boolean;
  readonly updatedAt: Date | null;
  readonly now: Date;
  readonly failed?: boolean;
  readonly onRetry?: () => void;
}) {
  const c = overviewText();
  const options = snapshot?.options;
  const units = (options?.orgUnits ?? []).filter(
    (u) => !selection.siteId || u.siteId === selection.siteId,
  );
  return (
    <header className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="sr-only">{c.pageTitle}</h2>
        {options && (
          <div className="mr-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <NativeSelect
              aria-label={c.site}
              className="min-w-0 flex-1 sm:w-48 sm:flex-none"
              value={selection.siteId ?? ''}
              disabled={options.sites.length <= 1}
              onChange={(e) => onSelect({ siteId: e.target.value || null, orgUnitId: null })}
            >
              {options.sites.length > 1 && (
                <NativeSelectOption value="">{c.allSites}</NativeSelectOption>
              )}
              {options.sites.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={c.unit}
              className="min-w-0 flex-1 sm:w-52 sm:flex-none"
              value={selection.orgUnitId ?? ''}
              disabled={units.length === 0}
              onChange={(e) => {
                const unit = units.find((u) => u.id === e.target.value);
                onSelect({ siteId: unit?.siteId ?? selection.siteId, orgUnitId: unit?.id ?? null });
              }}
            >
              <NativeSelectOption value="">{c.allUnits}</NativeSelectOption>
              {units.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <InfoTip text={c.scopeHint} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <LiveBadge live={live} hint={live ? c.live : c.polling} />
          {updatedAt && (
            <Muted className="tabular-nums">
              {format(c.updatedAt, { time: formatTime(updatedAt.toISOString()) })}
            </Muted>
          )}
        </div>
      </div>
      {failed && !snapshot && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-amber-800 dark:text-amber-200"
        >
          <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{c.snapshotFailed}</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {c.retry}
          </Button>
        </div>
      )}
      {snapshot && snapshot.contexts.some(hasShiftToShow) && (
        <ul className="flex flex-col gap-2">
          {snapshot.contexts.filter(hasShiftToShow).map((ctx) => (
            <ShiftLine
              key={ctx.siteId}
              ctx={ctx}
              showSite={snapshot.contexts.length > 1}
              now={now}
            />
          ))}
        </ul>
      )}
    </header>
  );
}

/** A day off — nobody planned, nothing recorded — is not a shift worth a line (owner, 2026-09-13). */
function hasShiftToShow(ctx: OverviewSiteContext): boolean {
  return !!(ctx.current?.staffed || ctx.closingPrevious?.staffed || ctx.next?.staffed);
}

function ShiftLine({
  ctx,
  showSite,
  now,
}: {
  readonly ctx: OverviewSiteContext;
  readonly showSite: boolean;
  readonly now: Date;
}) {
  const c = overviewText();
  const current = ctx.current?.staffed ? ctx.current : null;
  const closing = ctx.closingPrevious?.staffed ? ctx.closingPrevious : null;
  const next = ctx.next?.staffed ? ctx.next : null;
  const Icon = current?.isNight ? MoonIcon : SunIcon;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {showSite && <span className="font-medium">{ctx.siteName}</span>}
      {current ? (
        <>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {format(c.shiftLine, {
              name: current.name,
              start: siteTime(current.startsAt, ctx.timezone),
              end: siteTime(current.endsAt, ctx.timezone),
            })}
          </span>
          <Muted>{format(c.businessDate, { date: businessDateLabel(current.businessDate) })}</Muted>
          <span className="tabular-nums">
            {format(c.timeLeft, {
              duration: formatDuration(minutesUntil(current.endsAt, now)),
            })}
          </span>
        </>
      ) : null}
      {closing && (
        <span className="inline-flex items-center gap-1">
          <StatusPill tone="warning">
            <Clock3Icon aria-hidden="true" className="size-3.5" />
            {format(c.closing, {
              name: closing.name,
              time: siteTime(closing.closesAt, ctx.timezone),
            })}
          </StatusPill>
          <InfoTip text={c.closingHint} />
        </span>
      )}
      {next && (
        <Muted>
          {format(c.nextShift, {
            name: next.name,
            time: siteTime(next.startsAt, ctx.timezone),
          })}
        </Muted>
      )}
    </li>
  );
}
