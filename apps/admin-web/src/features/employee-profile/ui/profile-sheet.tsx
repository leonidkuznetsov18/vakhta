import { Link, useMatchRoute } from '@tanstack/react-router';
import { avatarUrl } from '@/entities/employee';
import { ApiError } from '@/api';
import { useQuery } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { QueryFeedback } from '@/components/app/query-feedback';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { buttonVariants } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/avatar';
import { ExternalLinkIcon } from 'lucide-react';
import { profileApi, profileKey } from '../model/api';

/** A scoped reading surface. All employee changes belong to the dedicated profile. */
export function ProfileSheet({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const matchRoute = useMatchRoute();
  const t = messages(currentLocale()).employeeProfile;
  const query = useQuery({
    queryKey: profileKey(employeeId),
    queryFn: ({ signal }) => profileApi.get(employeeId, signal),
  });
  const profile =
    query.error instanceof ApiError && [403, 404].includes(query.error.status) ? null : query.data;
  const employee = profile?.employee;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{employee?.fullName ?? t.title}</SheetTitle>
          <SheetDescription>{employee?.personnelNumber ?? t.title}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 p-4">
          <QueryFeedback query={query} />
          {profile && employee && (
            <>
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={employee.fullName}
                  email={employee.id}
                  image={avatarUrl(employee.id, profile.avatarVersion)}
                  className="size-16"
                />
                <div className="space-y-1 text-sm">
                  <p>
                    {
                      messages(currentLocale()).admin.administration.employees.statuses[
                        employee.status
                      ]
                    }
                  </p>
                  <p className="text-muted-foreground">
                    {employee.telegramLinked ? t.linked : t.unlinked}
                  </p>
                </div>
              </div>
              <dl className="grid min-w-0 gap-5 [overflow-wrap:anywhere] sm:grid-cols-2">
                {[
                  [t.position, profile.work.position?.name],
                  [t.unit, profile.work.unit?.name],
                  [t.team, profile.work.team?.name],
                  [t.master, profile.work.master.employee?.name],
                  [t.zone, profile.work.zone.current?.name],
                  [t.phone, employee.phone],
                  [t.email, employee.email],
                  [t.telegram, employee.telegramUsername ? `@${employee.telegramUsername}` : null],
                  [
                    t.birthDate,
                    typeof profile.birthDate === 'string'
                      ? profile.birthDate
                      : profile.birthDate
                        ? `${String(profile.birthDate.day).padStart(2, '0')}.${String(profile.birthDate.month).padStart(2, '0')}`
                        : null,
                  ],
                  ...(profile.access.maritalStatus
                    ? [[t.maritalStatus, profile.maritalStatus ? t[profile.maritalStatus] : null]]
                    : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm">{value || t.notSpecified}</dd>
                  </div>
                ))}
              </dl>
              <Link
                to="/administration/{-$tab}/{-$detail}"
                params={{ tab: 'employees', detail: employee.id }}
                replace={!!matchRoute({ to: '/administration/{-$tab}/{-$detail}', fuzzy: true })}
                resetScroll={false}
                onClick={onClose}
                className={buttonVariants({ variant: 'default' })}
              >
                <ExternalLinkIcon aria-hidden="true" />
                {t.openProfile}
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
