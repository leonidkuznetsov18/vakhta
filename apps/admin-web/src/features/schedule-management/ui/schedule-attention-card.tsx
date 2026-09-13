import type { EmployeeView } from '@vakhta/contracts';
import { EmployeeProfileLink } from '@/entities/employee';
import { CalendarHeartIcon } from 'lucide-react';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/app/query-feedback';
import { InfoTip } from '@/components/app/info-tip';
import { useScheduleAttention } from '../model/use-events';

const t = messages(currentLocale()).scheduleWorkspace;

/**
 * Today's schedule attention for masters and administrators: holiday, birthdays, people on sick
 * leave and shifts without a person in the next week. Mountable on the Overview page.
 */
export function ScheduleAttentionCard({
  accessKey,
  siteId,
  employees,
}: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly employees: readonly Pick<EmployeeView, 'id' | 'fullName' | 'avatarVersion'>[];
}) {
  const navigation = useNavigation();
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  function identity(id: string) {
    const employee = employeeById.get(id);
    return (
      <EmployeeProfileLink
        id={id}
        name={employee?.fullName ?? t.unknownEmployee}
        avatarVersion={employee?.avatarVersion}
      />
    );
  }

  const query = useScheduleAttention({ accessKey, siteId });
  const data = query.data;
  const holiday = data?.holiday
    ? ((t as unknown as Record<string, string>)[`holiday${data.holiday}`] ?? data.holiday)
    : null;
  const sick = data?.onSickLeave ?? [];
  const quiet =
    !!data &&
    !holiday &&
    data.birthdaysToday.length === 0 &&
    sick.length === 0 &&
    data.replacements.length === 0;
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label={t.attentionTitle}>
      <div className="flex items-center gap-1">
        <CalendarHeartIcon aria-hidden className="size-4" />
        <h3 className="text-sm font-semibold">{t.attentionTitle}</h3>
        <InfoTip text={t.eventsHint} />
      </div>
      <QueryFeedback query={query} errorMessage={t.eventsUnavailable} />
      {quiet && <p className="text-sm text-muted-foreground">{t.attentionNone}</p>}
      {holiday && (
        <p className="text-sm text-rose-700 dark:text-rose-300">
          🎉 {format(t.attentionHoliday, { name: holiday })}
        </p>
      )}
      {data && data.birthdaysToday.length > 0 && (
        <div className="space-y-2 text-sm text-violet-800 dark:text-violet-200">
          <p>{t.attentionBirthdays}</p>
          <ul className="space-y-2">
            {data.birthdaysToday.map((id) => (
              <li key={id}>{identity(id)}</li>
            ))}
          </ul>
        </div>
      )}
      {sick.length > 0 && (
        <div className="space-y-2 text-sm text-red-800 dark:text-red-200">
          <p>{t.attentionSick}</p>
          <ul className="space-y-2">
            {sick.map((row) => {
              const answer = row.lastCheckin
                ? row.lastCheckin.answer === 'GOOD'
                  ? t.checkinGood
                  : row.lastCheckin.answer === 'SAME'
                    ? t.checkinSame
                    : t.checkinWorse
                : null;
              return (
                <li key={row.employeeId} className="space-y-1">
                  {identity(row.employeeId)}
                  {answer && <p className="pl-10">{answer}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {data && data.replacements.length > 0 && (
        <p className="text-sm text-orange-800 dark:text-orange-200">
          {format(t.attentionReplacements, { count: data.replacements.length })}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={() => navigation.go('schedule')}>
        {t.openSchedule}
      </Button>
    </section>
  );
}
