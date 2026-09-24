import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanRow } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { SelectField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

/**
 * Copies a plan to another machine as a draft (AC-018); the new machine's card opens so its
 * mechanic, first date and source can be confirmed before publishing.
 */
export function CopyPlanDialog({
  plan,
  sourceEquipmentId,
  onClose,
  onCopied,
}: {
  readonly plan: PlanRow;
  readonly sourceEquipmentId: string;
  readonly onClose: () => void;
  readonly onCopied: (equipmentId: string) => void;
}) {
  const t = maintenanceMessages();
  const [target, setTarget] = useState('');
  const machines = useQuery(maintenanceQueries.equipmentList({ archived: false }));
  const client = useQueryClient();
  const options = (machines.data ?? [])
    .filter((machine) => machine.id !== sourceEquipmentId)
    .map((machine) => ({ value: machine.id, label: `${machine.code} ${machine.name}` }));
  const copy = useMutation({
    mutationFn: (equipmentId: string) => maintenanceApi.copyPlan(plan.id, { equipmentId }),
    onSuccess: async (_created, equipmentId) => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      const label = options.find((option) => option.value === equipmentId)?.label ?? '';
      notifySuccess(format(t.plans.copied, { machine: label }));
      onCopied(equipmentId);
    },
  });
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={format(t.plans.copyTitle, { title: plan.title })}
      description={t.plans.copyHint}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (target && !copy.isPending) copy.mutate(target);
        }}
      >
        <Feedback error={copy.error ? describeError(copy.error) : null} />
        <SelectField
          label={t.plans.copyTarget}
          value={target}
          onChange={setTarget}
          options={options}
          placeholder={t.form.choose}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" disabled={!target} pending={copy.isPending}>
            {t.plans.copyAction}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
