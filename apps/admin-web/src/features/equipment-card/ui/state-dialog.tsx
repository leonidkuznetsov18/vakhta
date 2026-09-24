import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDetail } from '@vakhta/contracts';
import { EQUIPMENT_STATES, type EquipmentState } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { maintenanceApi, maintenanceKeys, maintenanceMessages } from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

function isState(value: string): value is EquipmentState {
  return EQUIPMENT_STATES.some((state) => state === value);
}

/** A record error in the machine's state, corrected by the chief mechanic with a reason (FR-005). */
export function StateDialog({
  machine,
  onClose,
}: {
  readonly machine: EquipmentDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [state, setState] = useState<EquipmentState>(machine.state);
  const [reason, setReason] = useState('');
  const client = useQueryClient();
  const correct = useMutation({
    mutationFn: () =>
      maintenanceApi.correctState(machine.id, {
        state,
        reason: reason.trim(),
        expectedVersion: machine.version,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.card.stateCorrected);
      onClose();
    },
  });
  const unchanged = state === machine.state || !reason.trim();
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={format(t.card.correctStateTitle, { machine: machine.code })}
      description={t.card.correctStateHint}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!unchanged && !correct.isPending) correct.mutate();
        }}
      >
        <Feedback error={correct.error ? describeError(correct.error) : null} />
        <SelectField
          label={t.card.newState}
          value={state}
          onChange={(value) => (isState(value) ? setState(value) : undefined)}
          options={EQUIPMENT_STATES.map((value) => ({ value, label: t.states[value] }))}
          searchable={false}
        />
        <FormField label={t.planForm.reasonTitle}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" disabled={unchanged} pending={correct.isPending}>
            {t.card.correctState}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
