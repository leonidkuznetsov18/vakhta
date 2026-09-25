import { ClockIcon, HistoryIcon, TimerIcon } from 'lucide-react';
import type { WorkDetail } from '@vakhta/contracts';
import { WorkStatus } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  EquipmentStatePill,
  WorkStatusPill,
  formatDayTime,
  maintenanceMessages,
} from '@/entities/maintenance';
import { InfoTip } from '@/components/app/info-tip';
import { StatusPill } from '@/components/app/page';
import { useNow } from '@/lib/clock';
import { formatDuration, formatTime, formatTimeSeconds } from '@/lib/format';
import {
  TimelineEntryKind,
  isFinal,
  minutesSince,
  minutesUntil,
  repairTimeline,
  type TimelineEntry,
} from '../model/work-view';
import { DeliveryFailures, DeliveryStatusPill } from './work-deliveries';
import { WorkField } from './work-field';
import { RichText } from '@/shared/ui/rich-text';

function ackText(ackDueAt: string, now: Date): string {
  const t = maintenanceMessages();
  const left = minutesUntil(ackDueAt, now);
  if (left <= 0) return t.work.escalated;
  return format(t.workCard.notAcceptedLeft, { left: formatDuration(left) });
}

/** State, acceptance countdown and downtime of the repair, shown in the sheet header. */
export function RepairMeta({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  const now = useNow();
  const waiting = !work.acceptedAt && work.ackDueAt && work.status !== WorkStatus.CANCELLED;
  return (
    <>
      <EquipmentStatePill state={work.equipmentState} />
      {waiting && work.ackDueAt ? (
        <StatusPill tone="danger">
          <TimerIcon />
          {ackText(work.ackDueAt, now)}
        </StatusPill>
      ) : (
        <WorkStatusPill status={work.status} />
      )}
      {work.stop && !work.stop.releasedAt ? (
        <StatusPill>
          <ClockIcon />
          {format(t.workCard.downtime, {
            duration: formatDuration(minutesSince(work.stop.startedAt, now)),
          })}
        </StatusPill>
      ) : null}
    </>
  );
}

function ReportQuote({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  if (!work.description) return null;
  const facts = [
    work.incident?.reportedBy,
    formatDayTime(work.reportedAt),
    work.stop ? t.workStopped : null,
  ].filter(Boolean);
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <RichText text={`«${work.description}»`} className="font-medium" />
      <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
    </div>
  );
}

function RepairSummary({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  if (!work.summary) return null;
  return (
    <div className="grid gap-2 text-sm">
      <WorkField label={t.workCard.summary}>{work.summary}</WorkField>
      {work.cause ? <WorkField label={t.workCard.cause}>{work.cause}</WorkField> : null}
      {work.partsUsed ? <WorkField label={t.workCard.partsUsed}>{work.partsUsed}</WorkField> : null}
    </div>
  );
}

/** Seconds matter on the day of the report: that is where who-was-told-when is read. */
function courseTime(at: string, reportedAt: string | null): string {
  const sameDay = reportedAt && new Date(at).toDateString() === new Date(reportedAt).toDateString();
  return sameDay ? formatTimeSeconds(at) : formatDayTime(at);
}

function EntryText({ entry }: { readonly entry: TimelineEntry }) {
  const t = maintenanceMessages();
  const events: Readonly<Record<string, string>> = t.events;
  if (entry.kind === TimelineEntryKind.DELIVERY) {
    const { delivery } = entry;
    return (
      <div className="flex flex-wrap items-center gap-2 break-words">
        {format(t.workCard.deliveryLine, {
          recipient: delivery.recipient,
          template: t.workCard.deliveryTemplate[delivery.template],
        })}
        <DeliveryStatusPill status={delivery.status} />
      </div>
    );
  }
  const { event } = entry;
  return (
    <>
      <div className="break-words">
        {events[event.type] ?? event.type}
        {event.actor ? <span className="text-muted-foreground"> · {event.actor}</span> : null}
      </div>
      {event.comment ? (
        <RichText text={event.comment} className="text-xs text-muted-foreground" />
      ) : null}
    </>
  );
}

function entryKey(entry: TimelineEntry): string {
  if (entry.kind === TimelineEntryKind.DELIVERY) return entry.delivery.id;
  return `${entry.at}:${entry.event.type}:${entry.event.actor ?? ''}`;
}

/** What happens next if nobody accepts the repair, shown under the recorded course (FR-063). */
function ExpectedEscalation({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  const now = useNow();
  if (work.acceptedAt || !work.ackDueAt || !work.escalateAt || isFinal(work.status)) return null;
  const steps = [
    {
      at: work.ackDueAt,
      text: format(t.escalationBackup, { backup: work.backup?.fullName ?? '—' }),
    },
    { at: work.escalateAt, text: t.escalationPanel },
  ];
  const upcoming = steps.filter((step) => Date.parse(step.at) > now.getTime());
  return (
    <>
      {upcoming.map((step) => (
        <li key={step.text} className="relative text-sm text-muted-foreground">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full border border-foreground/60 bg-background" />
          <span className="text-xs tabular-nums">
            {format(t.expected, { time: formatTime(step.at) })}
          </span>
          <div className="break-words">{step.text}</div>
        </li>
      ))}
    </>
  );
}

/** Events and the notices they sent, in one course, then the escalation still ahead. */
function RepairCourse({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <HistoryIcon className="size-4" aria-hidden="true" /> {t.history}
        <InfoTip text={t.deliveriesHint} />
      </h3>
      <DeliveryFailures work={work} />
      <ol className="flex flex-col gap-3 border-l pl-4">
        {repairTimeline(work).map((entry) => (
          <li key={entryKey(entry)} className="relative text-sm">
            <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-foreground/60" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {courseTime(entry.at, work.reportedAt)}
            </span>
            <EntryText entry={entry} />
          </li>
        ))}
        <ExpectedEscalation work={work} />
      </ol>
    </section>
  );
}

function incidentText(work: WorkDetail): string {
  if (!work.incident) return '—';
  return [work.incident.reasonLabel, work.incident.reportedBy].filter(Boolean).join(' · ');
}

/** The course of an emergency repair (FR-061–FR-066). */
export function RepairBody({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <WorkField label={t.responsible}>{(work.lead ?? work.assignee).fullName}</WorkField>
        <WorkField label={t.backup}>{work.backup?.fullName ?? '—'}</WorkField>
        <WorkField label={t.incident}>{incidentText(work)}</WorkField>
      </div>
      <ReportQuote work={work} />
      <RepairSummary work={work} />
      <RepairCourse work={work} />
    </>
  );
}
