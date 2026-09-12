import { InfoTip } from '@/components/app/info-tip';
import { AssignmentChanges } from './assignment-changes';
import { assignmentChanges } from '../model/grid';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { monthDates } from '@vakhta/domain';
import { ChevronLeftIcon, ChevronRightIcon, Undo2Icon, Redo2Icon, PlusIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SelectField } from '@/components/app/fields';
import { MonthField, DateField } from '@/components/app/date-picker';
import { EmptyState } from '@/components/app/page';
import { HowItWorks } from '@/components/app/how-it-works';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { useConfirm } from '@/components/app/confirm-dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { StateFilter } from '@/shared/ui/state-filter';
import { readError } from '@/errors';
import { useWorkspace } from '../model/use-workspace';
import { periodDates, shiftDate, type PeriodMode } from '../model/planning';
import type { GridState } from '../model/grid';
import { ResourceSchedule } from './resource-schedule';
import { calendarWeek, siteToday } from '../model/calendar';
import { ZoneSchedule } from './zone-schedule';
import { PeopleSchedule } from './people-schedule';
import { ScheduleHistory } from './schedule-history';
import { BatchPlanner } from './batch-planner';
import { PublicationReview } from './publication-review';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
export function ScheduleWorkspace() {
  const w = useWorkspace();
  return (
    <div className="min-w-0 space-y-4">
      <div className="hidden md:block">
        <HowItWorks guide="schedule" />
      </div>
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        {(w.org?.sites.length ?? 0) > 1 && (
          <SelectField
            label={s.site}
            value={w.siteId}
            onChange={w.changeSite}
            disabled={w.busy || !w.org}
            options={w.org?.sites.map((site) => ({ value: site.id, label: site.name })) ?? []}
            className="min-w-0 w-full sm:w-56"
          />
        )}
        <SelectField
          label={s.orgUnit}
          value={w.orgUnitId}
          onChange={w.changeUnit}
          disabled={w.busy || !w.org}
          options={w.units.map((unit) => ({ value: unit.id, label: unit.name }))}
          className="min-w-0 w-full sm:w-64"
        />
        <MonthField
          label={s.month}
          value={w.month}
          onChange={w.changeMonth}
          className="min-w-0 w-full sm:w-48"
        />
      </div>
      <QueryFeedback query={w.orgResult.queryState} />
      <QueryFeedback query={w.versionsQuery} />
      <QueryFeedback query={w.templatesQuery} />
      {w.canReadEmployees && <QueryFeedback query={w.employeeResult.queryState} />}
      {w.extraQueries
        .filter((query) => query.isError)
        .slice(0, 1)
        .map((query) => (
          <QueryFeedback key="names" query={query} errorMessage={t.namesUnavailable} />
        ))}
      <Feedback error={readError(w.error)} />
      {w.store.recoveryError && <Feedback error={null} notice={t.recovery} />}
      {w.versionsQuery.isSuccess && !w.versions.length ? (
        <EmptyState
          text={t.empty}
          action={
            w.rights.edit ? (
              <Button disabled={w.busy} onClick={w.createDraft}>
                {t.create}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <WorkspaceView key={w.scope} workspace={w} />
      )}
    </div>
  );
}
function WorkspaceView({ workspace: w }: { workspace: ReturnType<typeof useWorkspace> }) {
  const mobile = useIsMobile();
  const [mode, setMode] = useState<PeriodMode | null>(null);
  const effectiveMode = mobile && mode === 'month' ? 'week' : (mode ?? (mobile ? 'day' : 'week'));
  const today = siteToday(w.timezone);
  const [grouping, setGrouping] = useState<'zones' | 'people' | 'history'>('zones');
  const [date, setDate] = useState(today.startsWith(w.month) ? today : `${w.month}-01`);
  const [zone, setZone] = useState('');
  const [batch, setBatch] = useState<{ zoneId: string; date: string } | null>(null);
  const [review, setReview] = useState<{ grid: GridState; versionId: string } | null>(null);
  const { confirm, dialog } = useConfirm();
  const version = w.version;
  const dates = periodDates(w.month, date, effectiveMode);
  const resourceDates = mobile
    ? calendarWeek(date).filter((value) => value.startsWith(w.month))
    : dates;
  const existingDraft = w.versions.find((value) => value.status === 'DRAFT');
  const pendingReview = w.versions.find((value) => value.status === 'IN_REVIEW');
  async function discard() {
    if (!version || w.busy) return;
    const accepted = await confirm({
      title: t.discard,
      description: t.discardHint,
      confirmLabel: t.discard,
    });
    if (accepted !== false) w.store.drop(version.id);
  }
  async function remove() {
    if (!version || w.busy) return;
    const accepted = await confirm({
      title: s.deleteVersion,
      description: s.deleteConfirm.replace('{no}', String(version.versionNo)),
      confirmLabel: s.deleteVersion,
      destructive: true,
    });
    if (accepted !== false) w.commit('remove');
  }
  async function returnDraft() {
    if (!version || w.busy) return;
    const reason = await confirm({
      title: s.returnToDraft,
      commentLabel: s.returnComment,
      commentRequired: true,
      confirmLabel: s.returnToDraft,
    });
    if (reason) w.commit('return', reason);
  }
  return (
    <div className="space-y-4 min-w-0">
      <QueryFeedback query={w.detailQuery} />
      {version && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">
                {version.status === 'PUBLISHED' ? t.current : s.statuses[version.status]}
              </h2>
              <Badge variant="outline">v{version.versionNo}</Badge>
              {w.changes > 0 && (
                <Badge variant="secondary">
                  {t.localChanges}: {w.changes}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!w.editMode &&
                ((version.status === 'DRAFT' && w.rights.edit) ||
                  (version.status === 'PUBLISHED' && w.rights.publish)) && (
                  <Button disabled={w.busy} onClick={w.begin}>
                    {t.edit}
                  </Button>
                )}
              {!w.editMode &&
                w.rights.edit &&
                version.status !== 'DRAFT' &&
                (existingDraft || !w.rights.publish) && (
                  <Button variant="outline" disabled={w.busy} onClick={w.createDraft}>
                    {existingDraft ? t.continueDraft : t.create}
                  </Button>
                )}
              {pendingReview && pendingReview.id !== version.id && (
                <Button variant="outline" disabled={w.busy} onClick={() => w.select(pendingReview)}>
                  {s.statuses.IN_REVIEW}
                </Button>
              )}
              {w.published && w.published.id !== version.id && (
                <Button
                  variant="outline"
                  disabled={w.busy}
                  onClick={() => {
                    if (w.published) w.select(w.published);
                  }}
                >
                  {t.backCurrent}
                </Button>
              )}
              {w.editMode && (
                <Button
                  variant="outline"
                  disabled={w.busy || w.changes > 0 || w.legacy}
                  onClick={w.finish}
                >
                  {t.finish}
                </Button>
              )}
              {w.writable && (
                <Button onClick={() => setBatch({ zoneId: zone, date })}>
                  <PlusIcon aria-hidden />
                  {t.add}
                </Button>
              )}
            </div>
          </div>
          {version.status === 'DRAFT' && (
            <p className="text-sm text-muted-foreground">{t.draftNotice}</p>
          )}
          {version.status === 'IN_REVIEW' && (
            <p className="text-sm text-muted-foreground">{t.reviewHint}</p>
          )}
          {w.preset && (
            <p className="text-sm">
              {t.preset}: {w.preset.people.map((person) => person.name).join(', ')}
            </p>
          )}
          {w.stale && <Feedback error={t.stale} />}
          {w.readOnlyChanges && (
            <section className="space-y-3 rounded-lg border p-3">
              <p>{t.readOnlyChanges}</p>
              <AssignmentChanges changes={assignmentChanges(w.baseline, w.localGrid)} labels={w} />
              <Button variant="outline" disabled={w.busy} onClick={() => void discard()}>
                {t.discard}
              </Button>
            </section>
          )}
          {w.legacy && w.editMode && (
            <section className="space-y-3 rounded-lg border p-3">
              <p className="text-sm">{t.legacy}</p>
              <AssignmentChanges changes={assignmentChanges(w.baseline, w.localGrid)} labels={w} />
              <Button disabled={w.busy} onClick={w.restoreLegacy}>
                {t.restore}
              </Button>
            </section>
          )}
          {w.editMode && !w.templates.some((template) => template.isActive) && (
            <Feedback error={null} notice={t.missingTemplates} />
          )}
          <Tabs
            value={grouping}
            onValueChange={(value) => {
              if (value === 'zones' || value === 'people' || value === 'history')
                setGrouping(value);
            }}
          >
            <TabsList aria-label={t.grouping}>
              <TabsTrigger value="zones">{t.zones}</TabsTrigger>
              <TabsTrigger value="people">{t.people}</TabsTrigger>
              <TabsTrigger value="history">{t.history}</TabsTrigger>
            </TabsList>
            {grouping !== 'history' && (
              <TabsContent value={grouping} className="space-y-3 pt-2 min-w-0">
                <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
                  <SelectField
                    label={t.zone}
                    value={zone}
                    onChange={setZone}
                    options={[
                      { value: '', label: t.allZones },
                      ...w.zones.map((item) => ({ value: item.id, label: item.name })),
                    ]}
                    className="min-w-0 w-full sm:w-64"
                  />
                  <DateField
                    label={t.date}
                    minDate={`${w.month}-01`}
                    maxDate={monthDates(w.month).at(-1)}
                    value={date}
                    onChange={(value) => {
                      if (monthDates(w.month).includes(value)) setDate(value);
                    }}
                    className="min-w-0 w-full sm:w-48"
                  />
                  <Button
                    variant="outline"
                    disabled={date === today}
                    onClick={() => {
                      if (date === today) return;
                      if (today.startsWith(w.month)) setDate(today);
                      else w.changeMonth(today.slice(0, 7));
                    }}
                  >
                    {t.today}
                  </Button>
                  <div className="col-span-2 flex items-center gap-2">
                    <IconButton
                      size="icon-sm"
                      variant="outline"
                      icon={ChevronLeftIcon}
                      label={t.previous}
                      tooltip={t.previous}
                      disabled={dates[0] === `${w.month}-01`}
                      onClick={() =>
                        setDate(shiftDate(w.month, date, effectiveMode === 'week' ? -7 : -1))
                      }
                    />
                    <StateFilter
                      label={t.period}
                      value={effectiveMode}
                      onChange={setMode}
                      options={(mobile
                        ? (['day', 'week'] as const)
                        : (['day', 'week', 'month'] as const)
                      ).map((value) => ({
                        value,
                        label: t[value],
                      }))}
                    />
                    <IconButton
                      size="icon-sm"
                      variant="outline"
                      icon={ChevronRightIcon}
                      label={t.next}
                      tooltip={t.next}
                      disabled={dates.at(-1) === monthDates(w.month).at(-1)}
                      onClick={() =>
                        setDate(shiftDate(w.month, date, effectiveMode === 'week' ? 7 : 1))
                      }
                    />
                  </div>
                </div>
                {effectiveMode === 'month' && !mobile ? (
                  grouping === 'zones' ? (
                    <ZoneSchedule
                      workspace={w}
                      dates={dates}
                      zoneId={zone}
                      selectedDate={date}
                      onDate={setDate}
                      onAdd={(zoneId, nextDate) => setBatch({ zoneId, date: nextDate })}
                    />
                  ) : (
                    <PeopleSchedule workspace={w} zoneId={zone} />
                  )
                ) : (
                  <ResourceSchedule
                    workspace={w}
                    dates={resourceDates}
                    grouping={grouping}
                    zoneId={zone}
                    selectedDate={date}
                    onDate={setDate}
                  />
                )}
              </TabsContent>
            )}
            <TabsContent value="history" className="pt-2 min-w-0">
              <ScheduleHistory workspace={w} />
            </TabsContent>
          </Tabs>
          {(w.editMode || (version.status === 'IN_REVIEW' && w.rights.publish)) && (
            <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 shadow-sm">
              {w.editMode && (
                <>
                  <IconButton
                    size="icon-sm"
                    variant="outline"
                    icon={Undo2Icon}
                    label={t.undo}
                    tooltip={t.undo}
                    disabled={!w.writable || !w.store.past[version.id]?.length}
                    onClick={() => {
                      if (w.writable) w.store.undo(version.id);
                    }}
                  />
                  <IconButton
                    size="icon-sm"
                    variant="outline"
                    icon={Redo2Icon}
                    label={t.redo}
                    tooltip={t.redo}
                    disabled={!w.writable || !w.store.future[version.id]?.length}
                    onClick={() => {
                      if (w.writable) w.store.redo(version.id);
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={w.busy || (!w.changes && !w.stale)}
                    onClick={() => void discard()}
                  >
                    {t.discard}
                  </Button>
                  {version.status === 'DRAFT' && (
                    <>
                      <Button disabled={!w.writable || !w.changes} onClick={() => w.commit('save')}>
                        {s.save} ({w.changes})
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          w.busy ||
                          w.changes > 0 ||
                          !w.grid.rows.some((row) => Object.values(row.cells).some(Boolean))
                        }
                        onClick={() => w.commit('submit')}
                      >
                        {s.submit}
                      </Button>
                      <InfoTip text={t.saveHint} />
                    </>
                  )}
                  {version.status === 'PUBLISHED' && (
                    <Button
                      disabled={!w.writable || !w.changes}
                      onClick={() => setReview({ grid: w.grid, versionId: version.id })}
                    >
                      {t.reviewPublish}
                    </Button>
                  )}
                  {version.deletable && w.rights.edit && (
                    <Button variant="ghost" disabled={w.busy} onClick={() => void remove()}>
                      {s.deleteVersion}
                    </Button>
                  )}
                </>
              )}
              {version.status === 'IN_REVIEW' && w.rights.publish && (
                <>
                  <Button
                    disabled={w.busy || w.changes > 0 || w.legacy}
                    onClick={() => setReview({ grid: w.grid, versionId: version.id })}
                  >
                    {t.reviewPublish}
                  </Button>
                  <Button variant="outline" disabled={w.busy} onClick={() => void returnDraft()}>
                    {s.returnToDraft}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
      {batch && (
        <BatchPlanner
          workspace={w}
          zoneId={batch.zoneId}
          date={batch.date}
          onClose={() => setBatch(null)}
        />
      )}
      {review && (
        <PublicationReview
          workspace={w}
          snapshot={review.grid}
          versionId={review.versionId}
          onClose={() => setReview(null)}
        />
      )}
      {dialog}
    </div>
  );
}
