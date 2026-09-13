import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AddCompensationEntryCommand,
  type CompensationEntry,
  type EmployeeProfileView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Paginator, usePages } from '@/components/app/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { InfoTip } from '@/components/app/info-tip';
import { LoadingState } from '@/shared/ui/loading-state';
import { profileApi, refreshProfiles } from '../model/api';
import { profileError } from '../model/editor';

export function CompensationSection({ profile }: { profile: EmployeeProfileView }) {
  const t = messages(currentLocale()).employeeProfile;
  const [editing, setEditing] = useState<{ entry: CompensationEntry | null } | null>(null);
  const data = profile.compensation;
  const pages = usePages(
    data?.history.length ?? 0,
    10,
    `profile-compensation-${profile.employee.id}`,
  );
  if (!data) return null;
  const actionLabel = data.history.length > 0 ? t.editCompensation : t.addEntry;
  const rows = data.history.slice(pages.from - 1, pages.to);
  return (
    <section
      className="min-w-0 space-y-4 border-t pt-6 lg:col-span-2"
      aria-labelledby="profile-compensation"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-compensation" className="text-lg font-semibold">
          {t.compensation} <InfoTip text={t.referenceOnly} />
        </h2>
        {profile.access.compensation === 'WRITE' && (
          <Button variant="outline" onClick={() => setEditing({ entry: null })}>
            {actionLabel}
          </Button>
        )}
      </div>
      <h3 className="text-sm font-medium text-muted-foreground">{t.current}</h3>
      {data.current ? (
        <CompensationValues entry={data.current} />
      ) : (
        <p className="text-sm text-muted-foreground">{t.notSpecified}</p>
      )}
      <details>
        <summary className="cursor-pointer rounded py-2 font-medium focus-visible:outline-2">
          {t.history} ({data.history.length})
        </summary>
        <ul className="divide-y">
          {rows.map((entry) => (
            <li key={entry.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {t.effectiveFrom} {entry.effectiveFrom}
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.state === 'CORRECTED'
                    ? t.corrected
                    : entry.state === 'SCHEDULED'
                      ? t.scheduled
                      : ''}
                </span>
                {profile.access.compensation === 'WRITE' && entry.state !== 'CORRECTED' && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ entry })}>
                    {t.correct}
                  </Button>
                )}
              </div>
              <CompensationValues entry={entry} />
              {entry.reason && (
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                  {entry.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
        {!rows.length && <p className="text-sm text-muted-foreground">{t.noHistory}</p>}
        <Paginator pages={pages} total={data.history.length} />
      </details>
      {editing && (
        <CompensationEditor
          profile={profile}
          entry={editing.entry}
          title={editing.entry ? t.correct : actionLabel}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
function CompensationValues({ entry }: { entry: CompensationEntry }) {
  const t = messages(currentLocale()).employeeProfile;
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {(['employmentRate', 'hourlyRate', 'monthlySalary'] as const).map((field) => (
        <div key={field}>
          <dt className="text-sm text-muted-foreground">{t[field]}</dt>
          <dd className="mt-1 font-medium tabular-nums">{entry[field] ?? t.notSpecified}</dd>
        </div>
      ))}
    </dl>
  );
}
function CompensationEditor({
  profile,
  entry,
  title,
  onClose,
}: {
  profile: EmployeeProfileView;
  entry: CompensationEntry | null;
  title: string;
  onClose: () => void;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [draft, setDraft] = useState(() => ({
    effectiveFrom: entry?.effectiveFrom ?? profile.compensation?.asOf ?? '',
    employmentRate: entry?.employmentRate ?? '1.00',
    hourlyRate: entry?.hourlyRate ?? '',
    monthlySalary: entry?.monthlySalary ?? '',
    reason: '',
  }));
  const [attempted, setAttempted] = useState(false);
  const client = useQueryClient();
  const parsed = AddCompensationEntryCommand.safeParse({
    ...draft,
    hourlyRate: draft.hourlyRate || null,
    monthlySalary: draft.monthlySalary || null,
    reason: draft.reason || null,
    correctsEntryId: entry?.id ?? null,
  });
  const changed = entry
    ? (['employmentRate', 'hourlyRate', 'monthlySalary'] as const).some(
        (field) =>
          Number(draft[field]) !== Number(entry[field]) ||
          (draft[field] === '') !== (entry[field] === null),
      )
    : !!(draft.hourlyRate || draft.monthlySalary);
  const mutation = useMutation({
    mutationFn: async () => {
      if (parsed.success && changed)
        await profileApi.addCompensation(profile.employee.id, parsed.data);
    },
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
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{profile.employee.fullName}</SheetDescription>
        </SheetHeader>
        <form
          className="space-y-5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (parsed.success && changed && !mutation.isPending) mutation.mutate();
          }}
        >
          {(
            [
              'effectiveFrom',
              'employmentRate',
              'hourlyRate',
              'monthlySalary',
              ...(entry ? ['reason' as const] : []),
            ] as const
          ).map((field) => {
            const invalid =
              attempted &&
              !parsed.success &&
              parsed.error.issues.some((issue) => issue.path[0] === field);
            return (
              <div key={field} className="space-y-2">
                <Label htmlFor={`comp-${field}`}>{t[field]}</Label>
                <Input
                  id={`comp-${field}`}
                  type={field === 'effectiveFrom' ? 'date' : 'text'}
                  inputMode={field === 'reason' || field === 'effectiveFrom' ? 'text' : 'decimal'}
                  disabled={mutation.isPending || (field === 'effectiveFrom' && !!entry)}
                  value={draft[field]}
                  aria-invalid={invalid}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
                {invalid && (
                  <p role="alert" className="text-sm text-destructive">
                    {t.invalid}
                  </p>
                )}
              </div>
            );
          })}
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {profileError(mutation.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={!changed || mutation.isPending}>
              {mutation.isPending ? (
                <LoadingState label={messages(currentLocale()).ui.common.saving} />
              ) : (
                t.save
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
