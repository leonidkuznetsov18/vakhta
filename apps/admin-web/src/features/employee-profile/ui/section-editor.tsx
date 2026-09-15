import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryFeedback } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useSectionEditor } from '../model/use-section-editor';
import { profileDraft, profileError, sectionFields, type ProfileSection } from '../model/editor';

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
  const { form, changed, mutation, conflict, latestQuery, latest, reset, acknowledgeLatest } =
    useSectionEditor(profile, section, onClose);
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{section === 'all' ? t.edit : t[section]}</h2>
      <form
        noValidate
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !conflict && !mutation.isPending) void form.handleSubmit();
        }}
      >
        <fieldset disabled={mutation.isPending} className="grid gap-5 sm:grid-cols-2">
          {sectionFields[section].map((field) => (
            <form.Field key={field} name={field}>
              {(input) => {
                const invalid = input.state.meta.errors.length > 0;
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
                        value={input.state.value}
                        onBlur={input.handleBlur}
                        onChange={(event) => input.handleChange(event.target.value)}
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
                        value={input.state.value}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? `error-${field}` : undefined}
                        onBlur={input.handleBlur}
                        onChange={(event) => input.handleChange(event.target.value)}
                      />
                    )}
                    {invalid && (
                      <Alert id={`error-${field}`} variant="destructive">
                        <AlertCircle aria-hidden="true" />
                        <AlertTitle>
                          {field === 'birthDate' ? t.birthInvalid : t.invalid}
                        </AlertTitle>
                      </Alert>
                    )}
                  </div>
                );
              }}
            </form.Field>
          ))}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{profileError(mutation.error)}</AlertTitle>
            </Alert>
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
              <Button type="button" variant="outline" onClick={acknowledgeLatest}>
                {t.useLatest}
              </Button>
            </section>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" disabled={!changed || mutation.isPending || conflict}>
              {mutation.isPending ? (
                <LoadingState label={messages(currentLocale()).ui.common.saving} />
              ) : (
                t.save
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!changed || mutation.isPending || conflict}
              onClick={reset}
            >
              {messages(currentLocale()).ui.common.reset}
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
