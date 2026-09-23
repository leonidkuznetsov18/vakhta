import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { apiFetch } from '@/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { QueryFeedback } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { notifySuccess } from '@/lib/toast';
import { profileDirectoryOptions } from '../model/directory';
import { refreshProfiles } from '../model/api';
import { profileError } from '../model/editor';

/** The unit's shift master; only an administrator changes it. */
export function UnitMasterField({
  unit,
  editable,
}: {
  readonly unit: OrgSnapshot['orgUnits'][number];
  readonly editable: boolean;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const saved = unit.masterEmployeeId ?? '';
  const [selected, setSelected] = useState(saved);
  const roster = useQuery(profileDirectoryOptions());
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(
        `/admin/org/units/${unit.id}/master`,
        selected
          ? { method: 'PUT', body: JSON.stringify({ employeeId: selected }) }
          : { method: 'DELETE' },
      ),
    retry: false,
    onSuccess: async () => {
      await refreshProfiles(client);
      notifySuccess(t.saved);
    },
  });
  const changed = selected !== saved;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable && changed && roster.data && !mutation.isPending) mutation.mutate();
      }}
    >
      <Label htmlFor={`unit-master-${unit.id}`}>{t.master}</Label>
      <QueryFeedback query={roster} />
      <div className="flex gap-2">
        <NativeSelect
          id={`unit-master-${unit.id}`}
          className="w-full"
          value={selected}
          // The current master is only nameable once the roster arrives; until then it cannot change.
          disabled={!editable || !roster.data || mutation.isPending}
          onChange={(event) => setSelected(event.target.value)}
        >
          <NativeSelectOption value="">{t.notAssigned}</NativeSelectOption>
          {(roster.data ?? [])
            .filter((employee) => employee.status === 'ACTIVE' || employee.id === saved)
            .map((employee) => (
              <NativeSelectOption key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.personnelNumber}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        {editable && (
          <Button variant="outline" disabled={!changed || mutation.isPending || !roster.data}>
            {mutation.isPending ? <LoadingState /> : t.save}
          </Button>
        )}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {profileError(mutation.error)}
        </p>
      )}
    </form>
  );
}
