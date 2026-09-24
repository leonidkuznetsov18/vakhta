import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDaysIcon,
  CameraIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClockIcon,
  HistoryIcon,
  TimerIcon,
  XCircleIcon,
} from 'lucide-react';
import type { WorkDetail, WorkOperationView } from '@vakhta/contracts';
import {
  DEFAULT_EMERGENCY_POLICY,
  ReviewDecision,
  WorkStatus,
  type OperationResult,
} from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  EquipmentStatePill,
  WorkStatusPill,
  formatBusinessDate,
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, StatusPill, type PillTone } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { useNow } from '@/lib/clock';
import { formatDateTime, formatDuration, formatTime } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import {
  ReleaseState,
  canChange,
  canReview,
  isFinal,
  isRepair,
  minutesSince,
  minutesUntil,
  releaseState,
} from '../model/work-view';
import { ChangeDialog, ReassignDialog, ReplanDialog } from './work-change-dialogs';

const RESULT_VIEW: Readonly<Record<OperationResult, { tone: PillTone; icon: ReactNode }>> = {
  DONE: { tone: 'success', icon: <CircleCheckIcon /> },
  NOT_DONE: { tone: 'danger', icon: <XCircleIcon /> },
  NOT_APPLICABLE: { tone: 'neutral', icon: <CircleDashedIcon /> },
};

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{children}</span>
    </div>
  );
}

function OperationPhoto({
  workId,
  mediaId,
}: {
  readonly workId: string;
  readonly mediaId: string;
}) {
  const t = maintenanceMessages();
  const link = useQuery(maintenanceQueries.photoLink(workId, mediaId));
  if (!link.data)
    return (
      <span className="flex h-16 w-24 items-center justify-center rounded border bg-muted text-muted-foreground">
        <CameraIcon className="size-5" aria-label={t.planForm.photo} />
      </span>
    );
  return (
    <a
      href={link.data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-fit rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <img
        src={link.data.url}
        alt={t.planForm.photo}
        className="h-16 w-24 rounded border object-cover"
      />
    </a>
  );
}

function OperationItem({
  workId,
  operation,
}: {
  readonly workId: string;
  readonly operation: WorkOperationView;
}) {
  const t = maintenanceMessages();
  const answer = operation.answer;
  const view = answer ? RESULT_VIEW[answer.result] : null;
  return (
    <li className="flex flex-col gap-1 rounded-md border p-2 text-sm">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="break-words">
          {operation.ordinal}. {operation.text}
          {operation.place ? (
            <span className="text-muted-foreground"> · {operation.place}</span>
          ) : null}
        </span>
        {answer && view ? (
          <StatusPill tone={view.tone}>
            {view.icon}
            {t.operationResult[answer.result]}
          </StatusPill>
        ) : (
          <span className="text-xs text-muted-foreground">{t.workCard.noAnswer}</span>
        )}
      </span>
      {answer?.reason ? (
        <span className="text-xs text-muted-foreground">
          {format(t.workCard.reason, { reason: answer.reason })}
        </span>
      ) : null}
      {answer?.mediaObjectId ? (
        <OperationPhoto workId={workId} mediaId={answer.mediaObjectId} />
      ) : null}
    </li>
  );
}

function PlannedBody({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label={t.workCard.performer}>
          {work.performedBy?.fullName ?? work.assignee.fullName}
        </Field>
        <Field label={t.workCard.started}>{formatDateTime(work.startedAt)}</Field>
        <Field label={t.workCard.submitted}>{formatDateTime(work.submittedAt)}</Field>
      </div>
      {work.readinessNote ? (
        <p className="text-sm">{format(t.workCard.readinessNote, { note: work.readinessNote })}</p>
      ) : null}
      <Separator />
      <h3 className="font-medium">{t.workCard.operations}</h3>
      {work.operations.length ? (
        <ol className="flex flex-col gap-2">
          {work.operations.map((operation) => (
            <OperationItem key={operation.id} workId={work.id} operation={operation} />
          ))}
        </ol>
      ) : (
        <EmptyState text={t.plans.empty} />
      )}
      {work.materials.length ? (
        <>
          <h3 className="font-medium">{t.workCard.materials}</h3>
          <ul className="text-sm">
            {work.materials.map((material) => (
              <li key={material.id}>
                {material.name} — {material.quantity} {material.unit}
                {material.article ? (
                  <span className="text-muted-foreground"> · {material.article}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {work.reviews.length ? <ReviewHistory work={work} /> : null}
    </>
  );
}

function ReviewHistory({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {work.reviews.map((review) => (
        <li key={review.iteration} className="rounded-md bg-muted/40 p-2">
          <span className="font-medium">
            {review.decision === ReviewDecision.ACCEPTED ? t.workCard.accept : t.workCard.return}
          </span>
          <span className="text-muted-foreground">
            {' '}
            · {review.reviewer} · {formatDateTime(review.reviewedAt)}
          </span>
          {review.comment ? (
            <p className="whitespace-pre-line break-words">{review.comment}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReviewPanel({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  const [comment, setComment] = useState('');
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: (decision: ReviewDecision) =>
      maintenanceApi.review(work.id, {
        decision,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: async (_result, decision) => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(
        decision === ReviewDecision.ACCEPTED ? t.workCard.accepted : t.workCard.returned,
      );
    },
  });
  return (
    <>
      <Feedback error={review.error ? describeError(review.error) : null} />
      <FormField label={t.workCard.returnComment}>
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        )}
      </FormField>
      {work.nextDueOnAfterAccept ? (
        <Alert>
          <CalendarDaysIcon />
          <AlertDescription>
            {format(t.workCard.nextAfterAccept, {
              title: work.title,
              date: formatBusinessDate(work.nextDueOnAfterAccept),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={!comment.trim()}
          pending={review.isPending && review.variables === ReviewDecision.RETURNED}
          onClick={() => review.mutate(ReviewDecision.RETURNED)}
        >
          {t.workCard.return}
        </Button>
        <Button
          variant="success"
          pending={review.isPending && review.variables === ReviewDecision.ACCEPTED}
          onClick={() => review.mutate(ReviewDecision.ACCEPTED)}
        >
          {t.workCard.accept}
        </Button>
      </div>
    </>
  );
}

function ackText(ackDueAt: string, now: Date): string {
  const t = maintenanceMessages();
  const left = minutesUntil(ackDueAt, now);
  if (left <= 0) return t.work.escalated;
  return format(t.workCard.notAcceptedLeft, { left: formatDuration(left) });
}

function RepairPills({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  const now = useNow();
  const waiting = !work.acceptedAt && work.ackDueAt && work.status !== WorkStatus.CANCELLED;
  return (
    <div className="flex flex-wrap gap-2">
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
          <ClockIcon />{' '}
          {format(t.workCard.downtime, {
            duration: formatDuration(minutesSince(work.stop.startedAt, now)),
          })}
        </StatusPill>
      ) : null}
    </div>
  );
}

function ReportQuote({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  if (!work.description) return null;
  const reporter = work.incident?.reportedBy;
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-medium whitespace-pre-line break-words">«{work.description}»</p>
      <p className="text-xs text-muted-foreground">
        {reporter
          ? format(t.workCard.reportedBy, { name: reporter, time: formatDateTime(work.reportedAt) })
          : formatDateTime(work.reportedAt)}
      </p>
    </div>
  );
}

function RepairSummary({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  if (!work.summary) return null;
  return (
    <div className="grid gap-2 text-sm">
      <Field label={t.workCard.summary}>{work.summary}</Field>
      {work.cause ? <Field label={t.workCard.cause}>{work.cause}</Field> : null}
      {work.partsUsed ? <Field label={t.workCard.partsUsed}>{work.partsUsed}</Field> : null}
    </div>
  );
}

/** What happens next if nobody accepts the repair, shown under the recorded course (FR-063). */
function ExpectedEscalation({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  const now = useNow();
  if (work.acceptedAt || !work.ackDueAt || isFinal(work.status)) return null;
  const ackDue = Date.parse(work.ackDueAt);
  const panelAt = new Date(ackDue + DEFAULT_EMERGENCY_POLICY.escalationGapMinutes * 60_000);
  const steps = [
    {
      at: work.ackDueAt,
      text: format(t.escalationBackup, { backup: work.backup?.fullName ?? '—' }),
    },
    { at: panelAt.toISOString(), text: t.escalationPanel },
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

function RepairHistory({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  const events: Readonly<Record<string, string>> = t.events;
  return (
    <>
      <h3 className="flex items-center gap-2 font-medium">
        <HistoryIcon className="size-4" aria-hidden="true" /> {t.workCard.history}
      </h3>
      <ol className="flex flex-col gap-3 border-l pl-4">
        {work.history.map((item) => (
          <li key={`${item.at}:${item.type}:${item.actor ?? ''}`} className="relative text-sm">
            <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-foreground/60" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDateTime(item.at)}
            </span>
            <div className="break-words">
              {events[item.type] ?? item.type}
              {item.actor ? <span className="text-muted-foreground"> · {item.actor}</span> : null}
            </div>
            {item.comment ? (
              <div className="text-xs whitespace-pre-line text-muted-foreground">
                {item.comment}
              </div>
            ) : null}
          </li>
        ))}
        <ExpectedEscalation work={work} />
      </ol>
    </>
  );
}

function RepairBody({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  return (
    <>
      <RepairPills work={work} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label={t.workCard.responsible}>{(work.lead ?? work.assignee).fullName}</Field>
        <Field label={t.workCard.incident}>{work.incident?.reasonLabel ?? '—'}</Field>
        <Field label={t.workCard.started}>{formatDateTime(work.startedAt)}</Field>
      </div>
      <ReportQuote work={work} />
      <RepairSummary work={work} />
      <RepairHistory work={work} />
    </>
  );
}

interface SheetProps {
  readonly workId: string;
  readonly canManage: boolean;
  readonly canRespond: boolean;
  readonly onClose: () => void;
  readonly onRelease: (equipmentId: string) => void;
}

function ReleaseButton({
  work,
  onRelease,
}: {
  readonly work: WorkDetail;
  readonly onRelease: (equipmentId: string) => void;
}) {
  const t = maintenanceMessages();
  const release = releaseState(work);
  if (release === ReleaseState.HIDDEN) return null;
  const ready = release === ReleaseState.READY;
  return (
    <span className="flex items-center gap-1">
      <Button variant="success" disabled={!ready} onClick={() => onRelease(work.equipment.id)}>
        {t.card.release}
      </Button>
      {ready ? null : <InfoTip text={t.workCard.releaseHint} />}
    </span>
  );
}

function ChangeButtons({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  const [dialog, setDialog] = useState<ChangeDialog>(ChangeDialog.NONE);
  const client = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const cancel = useMutation({
    mutationFn: (reason: string) => maintenanceApi.cancel(work.id, reason),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.workCard.cancelled);
    },
  });
  const askCancel = async () => {
    const reason = await confirm({
      title: t.workCard.cancel,
      commentLabel: t.planForm.reasonTitle,
      commentRequired: true,
      destructive: true,
    });
    if (reason !== false) cancel.mutate(reason);
  };
  const close = () => setDialog(ChangeDialog.NONE);
  return (
    <>
      <Feedback error={cancel.error ? describeError(cancel.error) : null} />
      {isRepair(work) ? null : (
        <Button variant="outline" onClick={() => setDialog(ChangeDialog.REPLAN)}>
          {t.workCard.replan}
        </Button>
      )}
      <Button variant="outline" onClick={() => setDialog(ChangeDialog.REASSIGN)}>
        {t.workCard.reassign}
      </Button>
      <Button variant="ghost" pending={cancel.isPending} onClick={() => void askCancel()}>
        {t.workCard.cancel}
      </Button>
      {dialog === ChangeDialog.REPLAN ? <ReplanDialog work={work} onClose={close} /> : null}
      {dialog === ChangeDialog.REASSIGN ? <ReassignDialog work={work} onClose={close} /> : null}
      {confirmDialog}
    </>
  );
}

function Footer({
  work,
  canManage,
  canRespond,
  onRelease,
}: Omit<SheetProps, 'workId' | 'onClose'> & { readonly work: WorkDetail }) {
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {canManage && canChange(work) ? <ChangeButtons work={work} /> : null}
      {canRespond ? <ReleaseButton work={work} onRelease={onRelease} /> : null}
    </div>
  );
}

/** A read-only card has no footer at all rather than an empty bar. */
function hasFooter(work: WorkDetail, access: { canManage: boolean; canRespond: boolean }): boolean {
  const changeable = access.canManage && canChange(work);
  return changeable || (access.canRespond && releaseState(work) !== ReleaseState.HIDDEN);
}

function titleOf(work: WorkDetail): string {
  const t = maintenanceMessages().workCard;
  return isRepair(work)
    ? format(t.emergencyTitle, {
        number: work.number,
        priority: maintenanceMessages().priority[work.priority],
      })
    : format(t.title, { number: work.number, title: work.title });
}

function SheetTitle({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  if (isRepair(work)) return <>{titleOf(work)}</>;
  return (
    <>
      {titleOf(work)}
      <WorkStatusPill status={work.status} />
      {work.planRevision ? (
        <StatusPill>
          {format(t.workCard.planVersion, {
            revision: work.planRevision,
            date: formatBusinessDate(work.dueOn),
          })}
        </StatusPill>
      ) : null}
    </>
  );
}

function WorkBody({ work, canManage }: { readonly work: WorkDetail; readonly canManage: boolean }) {
  if (isRepair(work)) return <RepairBody work={work} />;
  return (
    <>
      <PlannedBody work={work} />
      {canManage && canReview(work) ? <ReviewPanel work={work} /> : null}
    </>
  );
}

/** One work order: the review of planned maintenance or the course of an emergency repair. */
export function WorkSheet({ workId, canManage, canRespond, onClose, onRelease }: SheetProps) {
  const t = maintenanceMessages();
  const query = useQuery(maintenanceQueries.workDetail(workId));
  const work = query.data;
  return (
    <DetailSheet
      open
      wide
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={work ? <SheetTitle work={work} /> : t.work.title}
      description={work ? `${work.equipment.code} ${work.equipment.name}` : undefined}
      footer={
        work && hasFooter(work, { canManage, canRespond }) ? (
          <Footer work={work} canManage={canManage} canRespond={canRespond} onRelease={onRelease} />
        ) : undefined
      }
    >
      <QueryFeedback query={query} />
      {work ? <WorkBody work={work} canManage={canManage} /> : null}
    </DetailSheet>
  );
}
