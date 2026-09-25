import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCompareArrowsIcon, MinusIcon, PlusIcon } from 'lucide-react';
import type { PlanVersionDiffView, WorkDetail } from '@vakhta/contracts';
import { WorkStatus } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DialogActions } from '@/components/app/dialog-actions';
import { IconButton } from '@/shared/ui/icon-button';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

type Change = { readonly key: string; readonly text: string; readonly added: boolean };

function operationChanges(diff: PlanVersionDiffView): Change[] {
  const line = (item: PlanVersionDiffView['operations']['added'][number]) =>
    item.place ? `${item.text} · ${item.place}` : item.text;
  return [
    ...diff.operations.removed.map((item, index) => ({
      key: `r${index}`,
      text: line(item),
      added: false,
    })),
    ...diff.operations.added.map((item, index) => ({
      key: `a${index}`,
      text: line(item),
      added: true,
    })),
  ];
}

function materialChanges(diff: PlanVersionDiffView): Change[] {
  const line = (item: PlanVersionDiffView['materials']['added'][number]) =>
    `${item.name} — ${item.quantity} ${item.unit}`;
  return [
    ...diff.materials.removed.map((item, index) => ({
      key: `r${index}`,
      text: line(item),
      added: false,
    })),
    ...diff.materials.added.map((item, index) => ({
      key: `a${index}`,
      text: line(item),
      added: true,
    })),
  ];
}

/** Added and removed lines, each with a sign and a word so colour is not the only signal. */
function ChangeList({ title, changes }: { readonly title: string; readonly changes: Change[] }) {
  const t = maintenanceMessages().workCard;
  if (!changes.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-medium">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {changes.map((change) => (
          <li
            key={change.key}
            className={
              change.added
                ? 'flex items-start gap-2 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100'
                : 'flex items-start gap-2 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700 line-through dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }
          >
            {change.added ? (
              <PlusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <MinusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="sr-only">{change.added ? t.diffAdded : t.diffRemoved}:</span>
            <span className="break-words">{change.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiffBody({ diff }: { readonly diff: PlanVersionDiffView }) {
  const t = maintenanceMessages();
  const operations = operationChanges(diff);
  const materials = materialChanges(diff);
  return (
    <div className="flex flex-col gap-3">
      {diff.fields.length ? (
        <p className="text-sm">
          <span className="font-medium">{t.workCard.diffRule}: </span>
          {diff.fields.map((field) => t.workCard.diffField[field]).join(', ')}
        </p>
      ) : null}
      <ChangeList title={t.workCard.operations} changes={operations} />
      <ChangeList title={t.workCard.materials} changes={materials} />
      {!operations.length && !materials.length ? (
        <p className="text-sm text-muted-foreground">{t.workCard.diffNone}</p>
      ) : null}
      {materials.length ? (
        <p className="text-sm text-muted-foreground">{t.workCard.diffReadiness}</p>
      ) : null}
    </div>
  );
}

function ApplyDialog({
  work,
  onClose,
}: {
  readonly work: WorkDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const diff = useQuery(maintenanceQueries.planDiff(work.id));
  const client = useQueryClient();
  const apply = useMutation({
    mutationFn: () => maintenanceApi.applyPlanVersion(work.id, { expectedVersion: work.version }),
    // Close first: the diff is gone once applied and must not be read again (409).
    onSuccess: async () => {
      onClose();
      notifySuccess(t.workCard.applied);
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
    },
  });
  const revisions = diff.data
    ? { from: diff.data.fromRevision, to: diff.data.toRevision }
    : { from: work.planRevision ?? 0, to: work.newerPlanRevision ?? 0 };
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={format(t.workCard.diffTitle, revisions)}
    >
      <Feedback error={apply.error ? describeError(apply.error) : null} />
      <QueryFeedback query={diff} />
      {diff.data ? <DiffBody diff={diff.data} /> : null}
      <DialogActions
        cancel={{ label: t.form.cancel, tooltip: t.form.cancelHint, onSelect: onClose }}
        action={{
          label: format(t.workCard.applyVersion, revisions),
          tooltip: t.workCard.actionHints.applyVersion,
          icon: GitCompareArrowsIcon,
          pending: apply.isPending,
          disabled: !diff.data,
          onClick: () => apply.mutate(),
        }}
      />
    </AddDialog>
  );
}

/**
 * Open work keeps the plan version it was created from; a newer version applies only after the
 * manager has seen the differences, and only before the work starts (FR-023, AC-015).
 */
export function NewerPlanAlert({
  work,
  canManage,
}: {
  readonly work: WorkDetail;
  readonly canManage: boolean;
}) {
  const t = maintenanceMessages().workCard;
  const [open, setOpen] = useState(false);
  if (!work.newerPlanRevision || !work.planRevision) return null;
  const revisions = { from: work.planRevision, to: work.newerPlanRevision };
  const applicable = canManage && work.status === WorkStatus.ASSIGNED;
  return (
    <Alert>
      <GitCompareArrowsIcon />
      <AlertTitle>{format(applicable ? t.newerPlan : t.newerPlanStarted, revisions)}</AlertTitle>
      {applicable ? (
        <AlertDescription>
          <IconButton
            icon={GitCompareArrowsIcon}
            label={t.compareApply}
            tooltip={t.compareApplyHint}
            size="sm"
            variant="outline"
            className="mt-1 text-foreground"
            onClick={() => setOpen(true)}
          />
          {open ? <ApplyDialog work={work} onClose={() => setOpen(false)} /> : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}
