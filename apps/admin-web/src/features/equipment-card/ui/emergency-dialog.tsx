import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDetail } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { maintenanceApi, maintenanceKeys, maintenanceMessages } from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

/** A breakdown reported by phone or seen on the floor becomes an emergency repair (AC-049). */
export function EmergencyDialog({
  machine,
  onClose,
}: {
  readonly machine: EquipmentDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [description, setDescription] = useState('');
  const [stoppedWork, setStoppedWork] = useState(true);
  const [safety, setSafety] = useState(false);
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      maintenanceApi.createEmergency(machine.id, {
        description: description.trim(),
        stoppedWork,
        safety,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.emergencyForm.created);
      onClose();
    },
  });
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={format(t.emergencyForm.title, { machine: `${machine.code} ${machine.name}` })}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Feedback error={create.error ? describeError(create.error) : null} />
        <FormField label={t.emergencyForm.description}>
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
        <CheckRow
          id="emergency-stopped"
          label={t.emergencyForm.stopped}
          checked={stoppedWork}
          onChange={setStoppedWork}
        />
        <CheckRow
          id="emergency-safety"
          label={t.emergencyForm.safety}
          checked={safety}
          onChange={setSafety}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            pending={create.isPending}
            disabled={!description.trim()}
          >
            {t.emergencyForm.create}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
