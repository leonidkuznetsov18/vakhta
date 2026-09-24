import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkDetail } from '@vakhta/contracts';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { DateField } from '@/components/app/date-picker';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

export const ChangeDialog = { NONE: 'NONE', REPLAN: 'REPLAN', REASSIGN: 'REASSIGN' } as const;
export type ChangeDialog = (typeof ChangeDialog)[keyof typeof ChangeDialog];

function ReasonField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const t = maintenanceMessages();
  return (
    <FormField label={t.planForm.reasonTitle}>
      {(id) => (
        <Textarea
          id={id}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}

function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: maintenanceKeys.all });
}

/** Move planned work to another day; the mechanic's reminders follow the new date (FR-042). */
export function ReplanDialog({
  work,
  onClose,
}: {
  readonly work: WorkDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [plannedOn, setPlannedOn] = useState(work.plannedOn ?? '');
  const [reason, setReason] = useState('');
  const refresh = useRefresh();
  const replan = useMutation({
    mutationFn: () => maintenanceApi.replan(work.id, { plannedOn, reason: reason.trim() }),
    onSuccess: async () => {
      await refresh();
      notifySuccess(t.workCard.replanned);
      onClose();
    },
  });
  const unchanged = plannedOn === work.plannedOn || !plannedOn;
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t.workCard.replan}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          replan.mutate();
        }}
      >
        <Feedback error={replan.error ? describeError(replan.error) : null} />
        <DateField label={t.workCard.replanTitle} value={plannedOn} onChange={setPlannedOn} />
        <ReasonField value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" pending={replan.isPending} disabled={unchanged || !reason.trim()}>
            {t.workCard.replan}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}

/** Give the work to another maintenance employee with a reason (AC-006). */
export function ReassignDialog({
  work,
  onClose,
}: {
  readonly work: WorkDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [employeeId, setEmployeeId] = useState('');
  const [reason, setReason] = useState('');
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const refresh = useRefresh();
  const reassign = useMutation({
    mutationFn: () => maintenanceApi.reassign(work.id, { employeeId, reason: reason.trim() }),
    onSuccess: async () => {
      await refresh();
      notifySuccess(t.workCard.reassigned);
      onClose();
    },
  });
  const options = (mechanics.data ?? [])
    .filter((option) => option.id !== work.assignee.id)
    .map((option) => ({ value: option.id, label: option.fullName }));
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t.workCard.reassign}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          reassign.mutate();
        }}
      >
        <Feedback error={reassign.error ? describeError(reassign.error) : null} />
        <SelectField
          label={t.form.responsible}
          value={employeeId}
          onChange={setEmployeeId}
          options={options}
          placeholder={t.form.choose}
          required
        />
        <ReasonField value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            pending={reassign.isPending}
            disabled={!employeeId || !reason.trim()}
          >
            {t.workCard.reassign}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
