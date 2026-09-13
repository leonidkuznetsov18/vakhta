import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryFeedback } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { ApiError } from '@/api';
import { profileApi, profileKey, refreshProfiles } from '../model/api';
import {
  profileDraft,
  profileError,
  sectionChanged,
  sectionCommand,
  sectionFields,
  type ProfileSection,
} from '../model/editor';

export function SectionEditor({
  profile,
  section,
  onClose,
}: {
  profile: EmployeeProfileView;
  section: ProfileSection;
  onClose: () => void;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [draft, setDraft] = useState(() => profileDraft(profile));
  const [baseline, setBaseline] = useState(() => profileDraft(profile));
  const [version, setVersion] = useState(profile.version);
  const [attempted, setAttempted] = useState(false);

  const client = useQueryClient();
  const parsed = sectionCommand(section, draft, version);
  const changed = sectionChanged(section, draft, baseline, version);
  const mutation = useMutation({
    mutationFn: async () => {
      const command = sectionCommand(section, draft, version);
      if (!changed || !command.success) return;
      await profileApi.save(profile.employee.id, command.data);
    },
    retry: false,
    onSuccess: async () => {
      await refreshProfiles(client);
      onClose();
    },
  });
  const conflict =
    mutation.error instanceof ApiError && mutation.error.code === 'EMPLOYEE_VERSION_CONFLICT';
  const latestQuery = useQuery({
    queryKey: [...profileKey(profile.employee.id), 'conflict', version],
    queryFn: ({ signal }) => profileApi.get(profile.employee.id, signal),
    enabled: conflict,
    retry: false,
  });
  const latest = conflict ? latestQuery.data : undefined;
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{section === 'all' ? t.edit : t[section]}</h2>
      <form
        noValidate
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (changed && parsed.success && !conflict && !mutation.isPending) mutation.mutate();
        }}
      >
        <fieldset disabled={mutation.isPending} className="grid gap-5 sm:grid-cols-2">
          {sectionFields[section].map((field) => {
            const invalid =
              attempted &&
              !parsed.success &&
              parsed.error.issues.some((issue) => issue.path[0] === field);
            return (
              <div key={field} className="space-y-2">
                <Label htmlFor={`profile-${field}`}>
                  {field === 'personnelNumber'
                    ? messages(currentLocale()).admin.administration.employees.personnelNumber
                    : t[field === 'telegramUsername' ? 'telegram' : field]}
                </Label>
                {field === 'maritalStatus' ? (
                  <select
                    id={`profile-${field}`}
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={draft[field]}
                    onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  >
                    <option value="">{t.notSpecified}</option>
                    {(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const).map((status) => (
                      <option key={status} value={status}>
                        {t[status]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`profile-${field}`}
                    type={
                      field === 'birthDate'
                        ? 'date'
                        : field === 'email'
                          ? 'email'
                          : field === 'phone'
                            ? 'tel'
                            : 'text'
                    }
                    value={draft[field]}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `error-${field}` : undefined}
                    onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  />
                )}
                {invalid && (
                  <p id={`error-${field}`} className="text-sm text-destructive" role="alert">
                    {field === 'birthDate' ? t.birthInvalid : t.invalid}
                  </p>
                )}
              </div>
            );
          })}
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {profileError(mutation.error)}
            </p>
          )}
          {conflict && <QueryFeedback query={latestQuery} />}
          {latest && (
            <section className="space-y-3 rounded-lg border p-3">
              <h3 className="font-medium">{t.currentValues}</h3>
              <dl>
                {sectionFields[section].map((field) => (
                  <div key={field} className="mb-2">
                    <dt className="text-xs text-muted-foreground">
                      {field === 'personnelNumber'
                        ? messages(currentLocale()).admin.administration.employees.personnelNumber
                        : t[field === 'telegramUsername' ? 'telegram' : field]}
                    </dt>
                    <dd className="break-words">
                      {field === 'maritalStatus'
                        ? latest.maritalStatus
                          ? t[latest.maritalStatus]
                          : t.notSpecified
                        : profileDraft(latest)[field] || t.notSpecified}
                    </dd>
                  </div>
                ))}
              </dl>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setVersion(latest.version);
                  setBaseline(profileDraft(latest));
                  mutation.reset();
                }}
              >
                {t.useLatest}
              </Button>
            </section>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={!changed || mutation.isPending || conflict}>
              {mutation.isPending ? (
                <LoadingState label={messages(currentLocale()).ui.common.saving} />
              ) : (
                t.save
              )}
            </Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              {t.cancel}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
