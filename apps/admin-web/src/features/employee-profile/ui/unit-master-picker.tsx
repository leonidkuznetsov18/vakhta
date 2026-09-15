import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { profileDirectory } from '../model/directory';
import { apiFetch } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { QueryFeedback } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { refreshProfiles } from '../model/api';
import { profileError } from '../model/editor';

export function UnitMasterPicker({
  unit,
  onClose,
}: {
  unit: OrgSnapshot['orgUnits'][number];
  onClose: () => void;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [selected, setSelected] = useState(unit.masterEmployeeId ?? '');
  const roster = useQuery({
    queryKey: ['employees', 'complete-directory'],
    queryFn: ({ signal }) => profileDirectory(signal),
  });
  const client = useQueryClient();
  const changed = selected !== (unit.masterEmployeeId ?? '');
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
      onClose();
    },
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t.setMaster}</SheetTitle>
          <SheetDescription>{unit.name}</SheetDescription>
        </SheetHeader>
        <form
          className="space-y-5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (changed && roster.data && !mutation.isPending) mutation.mutate();
          }}
        >
          <QueryFeedback query={roster} />
          <Label htmlFor="unit-master">{t.master}</Label>
          <select
            id="unit-master"
            className="h-10 w-full rounded border bg-background px-3"
            value={selected}
            // The current master is only nameable once the roster arrives; until then it cannot change.
            disabled={!roster.data}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{t.notAssigned}</option>
            {(roster.data ?? [])
              .filter((employee) => employee.status === 'ACTIVE')
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} · {employee.personnelNumber}
                </option>
              ))}
          </select>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {profileError(mutation.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={!changed || mutation.isPending || !roster.data}>
              {mutation.isPending ? <LoadingState /> : t.save}
            </Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
