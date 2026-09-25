import { CircleCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RELEASE_MODES, ReleaseMode, type ReleaseMode as Mode } from '@vakhta/domain';
import { maintenanceApi, maintenanceKeys, maintenanceMessages } from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { DialogActions } from '@/components/app/dialog-actions';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

/** Only an authorised person returns a stopped machine to service (FR-065, AC-046). */
export function ReleaseDialog({
  equipmentId,
  onClose,
}: {
  readonly equipmentId: string;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [mode, setMode] = useState<Mode>(ReleaseMode.AVAILABLE);
  const [condition, setCondition] = useState('');
  const client = useQueryClient();
  const release = useMutation({
    mutationFn: () =>
      maintenanceApi.release(equipmentId, {
        mode,
        ...(mode === ReleaseMode.RESTRICTED ? { condition: condition.trim() } : {}),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.workCard.released);
      onClose();
    },
  });
  const needsCondition = mode === ReleaseMode.RESTRICTED && !condition.trim();
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t.workCard.releaseTitle}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          release.mutate();
        }}
      >
        <Feedback error={release.error ? describeError(release.error) : null} />
        <SelectField
          label={t.workCard.releaseTitle}
          value={mode}
          onChange={(value) => setMode(RELEASE_MODES.find((item) => item === value) ?? mode)}
          options={RELEASE_MODES.map((value) => ({ value, label: t.releaseMode[value] }))}
        />
        {mode === ReleaseMode.RESTRICTED ? (
          <FormField label={t.workCard.condition}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={condition}
                onChange={(event) => setCondition(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <DialogActions
          cancel={{ label: t.form.cancel, tooltip: t.form.cancelHint, onSelect: onClose }}
          action={{
            label: t.card.release,
            tooltip: t.card.actionHints.release,
            icon: CircleCheckIcon,
            variant: 'success',
            pending: release.isPending,
            disabled: needsCondition,
          }}
        />
      </form>
    </AddDialog>
  );
}
