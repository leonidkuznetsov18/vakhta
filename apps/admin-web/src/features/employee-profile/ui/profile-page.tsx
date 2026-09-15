import { Link, useMatchRoute } from '@tanstack/react-router';
import { ApiError } from '@/api';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { AlertTriangleIcon, CopyIcon, PencilIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Button } from '@/components/ui/button';
import { Paginator, usePages } from '@/components/app/data-table';
import { IconButton } from '@/shared/ui/icon-button';
import { formatDuration } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { profileApi, profileKey } from '../model/api';
import { StatusAction } from './status-action';
import { AvatarControl } from './avatar-control';
import { CompensationSection } from './compensation-section';
import { SectionEditor } from './section-editor';

export function ProfilePage({
  employeeId,
  onOpenSchedule,
  renderWorkEditor,
}: {
  employeeId: string;
  onOpenSchedule: (profile: EmployeeProfileView) => void;
  renderWorkEditor?: (profile: EmployeeProfileView) => ReactNode;
}) {
  const matchRoute = useMatchRoute();
  const query = useQuery({
    queryKey: profileKey(employeeId),
    queryFn: ({ signal }) => profileApi.get(employeeId, signal),
  });
  const t = messages(currentLocale()).employeeProfile;
  const visibleProfile =
    query.error instanceof ApiError && [403, 404].includes(query.error.status) ? null : query.data;
  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-5" data-profile-page>
      <Link
        to="/administration/{-$tab}/{-$detail}"
        params={{ tab: 'employees', detail: undefined }}
        replace={!!matchRoute({ to: '/administration/{-$tab}/{-$detail}', fuzzy: true })}
        resetScroll={false}
        className="inline-flex rounded text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2"
      >
        ← {t.back}
      </Link>
      <QueryFeedback query={query} />
      {visibleProfile && (
        <ProfileContent
          key={employeeId}
          profile={visibleProfile}
          onOpenSchedule={onOpenSchedule}
          renderWorkEditor={renderWorkEditor}
        />
      )}
    </div>
  );
}

export function ProfileContent({
  profile,
  onOpenSchedule,
  renderWorkEditor,
}: {
  profile: EmployeeProfileView;
  onOpenSchedule: (profile: EmployeeProfileView) => void;
  renderWorkEditor?: (profile: EmployeeProfileView) => ReactNode;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [editing, setEditing] = useState(false);
  const e = profile.employee;
  const historyPages = usePages(profile.work.history.length, 10, `profile-work-${e.id}`);
  return (
    <article className="min-w-0 space-y-7 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-start gap-5 border-b pb-6">
        <AvatarControl profile={profile} mode={editing ? 'edit' : 'read'} />
        <div className="min-w-0 flex-1 basis-52 space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{e.fullName}</h1>
            {!editing && profile.access.personalEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden="true" />
                {t.edit}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>№ {e.personnelNumber}</span>
            <span>
              {messages(currentLocale()).admin.administration.employees.statuses[e.status]}
            </span>
            <span>{e.telegramLinked ? t.linked : t.unlinked}</span>
          </div>
          <p className="text-sm">
            {profile.work.position?.name ?? t.notAssigned} ·{' '}
            {profile.work.unit?.name ?? t.notAssigned}
          </p>
          <p className="text-sm">
            {t.zone}: {profile.work.zone.current?.name ?? t.notScheduled}
          </p>
          <Master profile={profile} />
          <StatusAction profile={profile} />
        </div>
      </header>
      {e.status === 'TERMINATED' && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t.terminated}
        </p>
      )}
      {editing && profile.access.personalEdit && (
        <div className="space-y-6">
          <SectionEditor profile={profile} section="all" onClose={() => setEditing(false)} />
          {renderWorkEditor?.(profile)}
        </div>
      )}
      <div className="grid min-w-0 gap-x-10 gap-y-8 lg:grid-cols-2">
        {!editing && (
          <>
            <ProfileSectionView title={t.contacts}>
              <dl className="space-y-4">
                <Contact label={t.phone} value={e.phone} href={e.phone ? `tel:${e.phone}` : null} />
                <Contact
                  label={t.email}
                  value={e.email}
                  href={e.email ? `mailto:${e.email}` : null}
                />
                <Contact
                  label={t.telegram}
                  value={e.telegramUsername ? `@${e.telegramUsername}` : null}
                  href={e.telegramUsername ? `https://t.me/${e.telegramUsername}` : null}
                />
              </dl>
            </ProfileSectionView>
            <ProfileSectionView title={t.work}>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Datum label={t.position}>{profile.work.position?.name}</Datum>
                <Datum label={t.unit}>{profile.work.unit?.name}</Datum>
                <Datum label={t.team}>{profile.work.team?.name}</Datum>
                <Datum label={t.zone}>
                  {profile.work.zone.current
                    ? `${profile.work.zone.current.name}${profile.work.zone.current.available ? '' : ` · ${t.unavailableZone}`}`
                    : t.notScheduled}
                </Datum>
              </dl>
              {profile.work.zone.monthZones.length > 0 && (
                <Datum label={t.monthZones}>
                  {profile.work.zone.monthZones.map((zone) => zone.name).join(', ')}
                </Datum>
              )}
              {profile.work.masterOf.length > 0 && (
                <Datum label={t.masterOf}>
                  {profile.work.masterOf.map((unit) => unit.name).join(', ')}
                </Datum>
              )}
              <details>
                <summary className="cursor-pointer rounded py-2 text-sm font-medium focus-visible:outline-2">
                  {t.history} ({profile.work.history.length})
                </summary>
                <ul className="max-h-64 divide-y overflow-y-auto text-sm">
                  {profile.work.history
                    .slice(historyPages.from - 1, historyPages.to)
                    .map((assignment) => (
                      <li key={assignment.id} className="space-y-1 py-3">
                        <p>
                          {assignment.position} · {assignment.unit}
                        </p>
                        <p>
                          {t.master}: {assignment.master ?? t.notSpecified}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.validFrom.slice(0, 10)} —{' '}
                          {assignment.validTo?.slice(0, 10) ?? t.current}
                        </p>
                      </li>
                    ))}
                </ul>
                <Paginator pages={historyPages} total={profile.work.history.length} />
                {!profile.work.history.length && (
                  <p className="text-sm text-muted-foreground">{t.noHistory}</p>
                )}
              </details>
            </ProfileSectionView>
            <ProfileSectionView title={t.personal}>
              <dl className="space-y-4">
                <Datum label={t.birthDate}>
                  {typeof profile.birthDate === 'string'
                    ? profile.birthDate
                    : profile.birthDate
                      ? `${String(profile.birthDate.day).padStart(2, '0')}.${String(profile.birthDate.month).padStart(2, '0')}`
                      : null}
                </Datum>
                {profile.access.maritalStatus && (
                  <Datum label={t.maritalStatus}>
                    {profile.maritalStatus ? t[profile.maritalStatus] : null}
                  </Datum>
                )}
              </dl>
            </ProfileSectionView>
            <ProfileSectionView title={`${t.schedule} · ${profile.schedule.month}`}>
              <p className="text-sm text-muted-foreground">
                {profile.schedule.published
                  ? `${t.planned}: ${profile.schedule.shiftCount} ${t.shifts} · ${formatDuration(profile.schedule.plannedMinutes)}`
                  : t.noPublished}
              </p>
              <ul className="divide-y">
                {profile.schedule.nextShifts.map((shift) => (
                  <li key={shift.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {shift.date} · {shift.template}
                      </p>
                      <p className="text-muted-foreground">{shift.zone?.name ?? t.notSpecified}</p>
                    </div>
                    <span className="tabular-nums">
                      {new Intl.DateTimeFormat(currentLocale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: shift.timezone,
                      }).format(new Date(shift.startAt))}
                      –
                      {new Intl.DateTimeFormat(currentLocale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: shift.timezone,
                      }).format(new Date(shift.endAt))}
                    </span>
                  </li>
                ))}
              </ul>
              {!profile.schedule.nextShifts.length && (
                <p className="text-sm text-muted-foreground">{t.noNext}</p>
              )}
              <Button variant="outline" onClick={() => onOpenSchedule(profile)}>
                {t.openSchedule}
              </Button>
            </ProfileSectionView>
          </>
        )}
        <CompensationSection profile={profile} />
      </div>
    </article>
  );
}
function ProfileSectionView({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Datum({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">
        {children || (
          <span className="text-muted-foreground">
            {messages(currentLocale()).employeeProfile.notSpecified}
          </span>
        )}
      </dd>
    </div>
  );
}
function Contact({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href: string | null;
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [copyError, setCopyError] = useState(false);
  return (
    <Datum label={label}>
      {value && href ? (
        <span className="flex items-start gap-2">
          <a
            className="min-w-0 rounded underline-offset-4 hover:underline focus-visible:outline-2"
            href={href}
            rel="noreferrer"
          >
            {value}
          </a>
          <IconButton
            icon={CopyIcon}
            label={`${t.copy}: ${label}`}
            tooltip={t.copy}
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void navigator.clipboard.writeText(value).then(
                () => {
                  setCopyError(false);
                  notifySuccess(t.copied);
                },
                () => setCopyError(true),
              );
            }}
          />
          {copyError && <span role="alert">{t.failed}</span>}
        </span>
      ) : null}
    </Datum>
  );
}
function Master({ profile }: { profile: EmployeeProfileView }) {
  const matchRoute = useMatchRoute();
  const t = messages(currentLocale()).employeeProfile;
  const master = profile.work.master;
  return (
    <div className="space-y-1 text-sm">
      <span className="text-muted-foreground">{t.master}: </span>
      {master.employee ? (
        master.canOpen ? (
          <Link
            className="rounded font-medium underline-offset-4 hover:underline focus-visible:outline-2"
            to="/administration/{-$tab}/{-$detail}"
            params={{ tab: 'employees', detail: master.employee.id }}
            replace={!!matchRoute({ to: '/administration/{-$tab}/{-$detail}', fuzzy: true })}
            resetScroll={false}
          >
            {master.employee.name}
          </Link>
        ) : (
          <span className="font-medium">{master.employee.name}</span>
        )
      ) : null}
      {master.isSelf && <span className="text-muted-foreground"> · {t.self}</span>}
      {master.state !== 'ASSIGNED' && (
        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {master.state === 'MISSING'
            ? t.missingMaster
            : master.state === 'INACTIVE'
              ? t.inactiveMaster
              : t.noPanelAccess}
        </p>
      )}
    </div>
  );
}
