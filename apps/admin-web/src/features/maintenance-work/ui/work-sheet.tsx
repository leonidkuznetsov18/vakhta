import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDaysIcon,
  CameraIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClipboardPenIcon,
  Undo2Icon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react';
import type { WorkDetail, WorkOperationView } from '@vakhta/contracts';
import { AnchorMode, ReviewDecision, type OperationResult } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  WorkStatusPill,
  formatDayMonth,
  formatDayTime,
  formatInstantDayMonth,
  machineLabel,
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { EmptyState, StatusPill, type PillTone } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { SheetActions, type SheetAction } from '@/components/app/sheet-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { formatDateTime } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import {
  ReleaseState,
  hasActions,
  isRepair,
  releaseState,
  workActions,
  type WorkActions,
} from '../model/work-view';
import { canRecordCompletion } from '../model/record-draft';
import { NewerPlanAlert } from './plan-version-dialog';
import { RecordCompletionDialog } from './record-completion-dialog';
import { RepairBody, RepairMeta } from './repair-body';
import { ChangeDialog, ReassignDialog, ReplanDialog } from './work-change-dialogs';
import { WorkDeliveries } from './work-deliveries';
import { WorkField } from './work-field';

const RESULT_VIEW: Readonly<Record<OperationResult, { tone: PillTone; icon: ReactNode }>> = {
  DONE: { tone: 'success', icon: <CircleCheckIcon /> },
  NOT_DONE: { tone: 'danger', icon: <XCircleIcon /> },
  NOT_APPLICABLE: { tone: 'neutral', icon: <CircleDashedIcon /> },
};

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
          {operation.text}
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

/** What was used once the work is handed in; until then, what the plan asks to prepare. */
function Materials({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  if (work.partsUsed)
    return (
      <section className="flex flex-col gap-1">
        <h3 className="font-medium">{t.used}</h3>
        <p className="text-sm whitespace-pre-line break-words">{work.partsUsed}</p>
      </section>
    );
  if (!work.materials.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-medium">{t.materials}</h3>
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
    </section>
  );
}

function ReviewHistory({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages();
  if (!work.reviews.length) return null;
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

function PlannedBody({
  work,
  canManage,
  review,
}: {
  readonly work: WorkDetail;
  readonly canManage: boolean;
  /** The review form, when the work waits for the manager's decision. */
  readonly review: ReactNode;
}) {
  const t = maintenanceMessages();
  return (
    <>
      <NewerPlanAlert work={work} canManage={canManage} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <WorkField label={t.workCard.performer}>
          {work.performedBy?.fullName ?? work.assignee.fullName}
        </WorkField>
        <WorkField label={t.workCard.started}>{formatDayTime(work.startedAt)}</WorkField>
        <WorkField label={t.workCard.submitted}>{formatDayTime(work.submittedAt)}</WorkField>
        {work.enteredBy ? (
          <WorkField label={t.workCard.enteredBy}>{work.enteredBy}</WorkField>
        ) : null}
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
      <Materials work={work} />
      <ReviewHistory work={work} />
      {review}
      <WorkDeliveries work={work} />
    </>
  );
}

function nextAfterAcceptText(work: WorkDetail, nextDueOn: string): string {
  const t = maintenanceMessages().workCard;
  return format(t.nextAfterAccept[work.anchorMode ?? AnchorMode.FROM_COMPLETION], {
    title: work.title,
    code: work.equipment.code,
    date: formatDayMonth(nextDueOn),
    performed: formatInstantDayMonth(work.performedAt),
  });
}

/** The remark and what acceptance will schedule; the decision buttons live in the footer. */
function ReviewForm({
  work,
  comment,
  onComment,
  error,
}: {
  readonly work: WorkDetail;
  readonly comment: string;
  readonly onComment: (comment: string) => void;
  readonly error: unknown;
}) {
  const t = maintenanceMessages().workCard;
  return (
    <>
      <Feedback error={error ? describeError(error) : null} />
      <FormField label={t.returnComment}>
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={comment}
            onChange={(event) => onComment(event.target.value)}
          />
        )}
      </FormField>
      {work.nextDueOnAfterAccept ? (
        <Alert>
          <CalendarDaysIcon />
          <AlertDescription>
            {nextAfterAcceptText(work, work.nextDueOnAfterAccept)}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

interface ReviewInput {
  readonly decision: ReviewDecision;
  readonly comment: string;
}

function useReview(workId: string, onReviewed: () => void) {
  const t = maintenanceMessages().workCard;
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      maintenanceApi.review(workId, {
        decision: input.decision,
        ...(input.comment.trim() ? { comment: input.comment.trim() } : {}),
      }),
    onSuccess: async (_result, input) => {
      onReviewed();
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(input.decision === ReviewDecision.ACCEPTED ? t.accepted : t.returned);
    },
  });
}

function ReviewButtons({
  review,
  comment,
}: {
  readonly review: ReturnType<typeof useReview>;
  readonly comment: string;
}) {
  const t = maintenanceMessages().workCard;
  const deciding = (decision: ReviewDecision) =>
    review.isPending && review.variables.decision === decision;
  return (
    <SheetActions
      actions={[
        {
          key: 'return',
          label: t.return,
          tooltip: t.actionHints.return,
          disabledHint: t.actionHints.returnNeedsComment,
          icon: Undo2Icon,
          disabled: !comment.trim() || review.isPending,
          pending: deciding(ReviewDecision.RETURNED),
          onSelect: () => review.mutate({ decision: ReviewDecision.RETURNED, comment }),
        },
        {
          key: 'accept',
          label: t.accept,
          tooltip: t.actionHints.accept,
          icon: CircleCheckIcon,
          variant: 'success',
          disabled: review.isPending,
          pending: deciding(ReviewDecision.ACCEPTED),
          onSelect: () => review.mutate({ decision: ReviewDecision.ACCEPTED, comment }),
        },
      ]}
    />
  );
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
  return (
    <SheetActions
      actions={[
        {
          key: 'release',
          label: t.card.release,
          tooltip: t.card.actionHints.release,
          disabledHint: t.workCard.releaseHint,
          icon: CircleCheckIcon,
          variant: 'success',
          disabled: release !== ReleaseState.READY,
          onSelect: () => onRelease(work.equipment.id),
        },
      ]}
    />
  );
}

/** Changes of unfinished work, every one in view with its icon; cancellation asks for a reason. */
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
  const record: SheetAction[] = canRecordCompletion(work)
    ? [
        {
          key: 'record',
          label: t.workCard.record,
          tooltip: t.workCard.actionHints.record,
          icon: ClipboardPenIcon,
          onSelect: () => setDialog(ChangeDialog.RECORD),
        },
      ]
    : [];
  const replan: SheetAction[] = isRepair(work)
    ? []
    : [
        {
          key: 'replan',
          label: t.workCard.replan,
          tooltip: t.workCard.actionHints.replan,
          icon: CalendarDaysIcon,
          onSelect: () => setDialog(ChangeDialog.REPLAN),
        },
      ];
  return (
    <>
      <Feedback error={cancel.error ? describeError(cancel.error) : null} />
      <SheetActions
        actions={[
          {
            key: 'cancel',
            label: t.workCard.cancel,
            tooltip: t.workCard.actionHints.cancel,
            icon: XCircleIcon,
            variant: 'destructive',
            pending: cancel.isPending,
            onSelect: () => void askCancel(),
          },
          ...record,
          ...replan,
          {
            key: 'reassign',
            label: t.workCard.reassign,
            tooltip: t.workCard.actionHints.reassign,
            icon: UserRoundIcon,
            onSelect: () => setDialog(ChangeDialog.REASSIGN),
          },
        ]}
      />
      {dialog === ChangeDialog.REPLAN ? <ReplanDialog work={work} onClose={close} /> : null}
      {dialog === ChangeDialog.REASSIGN ? <ReassignDialog work={work} onClose={close} /> : null}
      {dialog === ChangeDialog.RECORD ? (
        <RecordCompletionDialog work={work} onClose={close} />
      ) : null}
      {confirmDialog}
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

function titleOf(work: WorkDetail): string {
  const t = maintenanceMessages().workCard;
  return isRepair(work)
    ? format(t.emergencyTitle, { number: work.number, priority: work.priority })
    : format(t.title, { number: work.number, title: work.title });
}

function PlannedMeta({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  return (
    <>
      <WorkStatusPill status={work.status} />
      {work.planRevision ? (
        <StatusPill>
          {format(t.planVersion, {
            revision: work.planRevision,
            date: formatDayMonth(work.dueOn),
          })}
        </StatusPill>
      ) : null}
    </>
  );
}

function Footer({
  work,
  actions,
  onRelease,
  review,
  comment,
}: {
  readonly work: WorkDetail;
  readonly actions: WorkActions;
  readonly onRelease: (equipmentId: string) => void;
  readonly review: ReturnType<typeof useReview>;
  readonly comment: string;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {actions.review ? <ReviewButtons review={review} comment={comment} /> : null}
      {actions.change ? <ChangeButtons work={work} /> : null}
      {actions.release ? <ReleaseButton work={work} onRelease={onRelease} /> : null}
    </div>
  );
}

function WorkSheetView({ workId, canManage, canRespond, onClose, onRelease }: SheetProps) {
  const t = maintenanceMessages();
  const query = useQuery(maintenanceQueries.workDetail(workId));
  const [comment, setComment] = useState('');
  const review = useReview(workId, () => setComment(''));
  const work = query.data;
  const close = (open: boolean) => (open ? undefined : onClose());
  if (!work)
    return (
      <DetailSheet open size="medium" onOpenChange={close} title={t.work.title}>
        <QueryFeedback query={query} />
      </DetailSheet>
    );
  const actions = workActions(work, { canManage, canRespond });
  return (
    <DetailSheet
      open
      size="medium"
      onOpenChange={close}
      title={titleOf(work)}
      description={`${machineLabel(work.equipment)} · ${work.location}`}
      meta={<WorkMeta work={work} />}
      // A read-only card has no footer at all rather than an empty bar.
      footer={
        hasActions(actions) ? (
          <Footer
            work={work}
            actions={actions}
            onRelease={onRelease}
            review={review}
            comment={comment}
          />
        ) : undefined
      }
    >
      <QueryFeedback query={query} />
      <WorkBody
        work={work}
        canManage={canManage}
        review={
          actions.review ? (
            <ReviewForm work={work} comment={comment} onComment={setComment} error={review.error} />
          ) : null
        }
      />
    </DetailSheet>
  );
}

function WorkMeta({ work }: { readonly work: WorkDetail }) {
  return isRepair(work) ? <RepairMeta work={work} /> : <PlannedMeta work={work} />;
}

function WorkBody({
  work,
  canManage,
  review,
}: {
  readonly work: WorkDetail;
  readonly canManage: boolean;
  readonly review: ReactNode;
}) {
  if (isRepair(work)) return <RepairBody work={work} />;
  return <PlannedBody work={work} canManage={canManage} review={review} />;
}

/** One work order: the review of planned maintenance or the course of an emergency repair. */
export function WorkSheet(props: SheetProps) {
  // Keyed by the work so a review remark typed for one work never carries over to another.
  return <WorkSheetView key={props.workId} {...props} />;
}
