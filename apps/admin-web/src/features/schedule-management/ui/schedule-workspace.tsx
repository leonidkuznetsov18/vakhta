import { useState } from 'react';
import { format, messages } from '@vakhta/i18n';
import {
  Undo2Icon,
  Redo2Icon,
  PlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
  UsersIcon,
  CopyIcon,
  BarChart3Icon,
} from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, Muted, StatusPill, type Tone } from '@/components/app/page';
import { HowItWorks } from '@/components/app/how-it-works';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { useConfirm } from '@/components/app/confirm-dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { readError } from '@/errors';
import { useNavigation } from '@/navigation';
import { recordedTime } from '../lib/labels';
import { scheduleAccessKey } from '../model/ownership';
import { useWorkspace, type Workspace } from '../model/use-workspace';
import { periodDates, type PeriodMode } from '../model/planning';
import { useAdjacentPlan } from '../model/use-adjacent';
import { useOpenSlots } from '../model/use-open-slots';
import { LoadingState } from '@/shared/ui/loading-state';
import { assignmentChanges, type GridState } from '../model/grid';
import { calendarWeek, siteToday, type CalendarGrouping } from '../model/calendar';
import { CommandRecovery } from './command-recovery';
import { AssignmentChanges } from './assignment-changes';
import { ResourceSchedule } from './resource-schedule';
import { PeopleSchedule } from './people-schedule';
import { BatchPlanner } from './batch-planner';
import { PublicationReview } from './publication-review';
import { ScheduleToolbar } from './schedule-toolbar';
import { ScheduleExport } from './schedule-export';
import { StaffingSheet } from './staffing-sheet';
import { WorkloadSheet } from './workload-sheet';
import { CopyPeriodDialog } from './copy-period';

const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat(currentLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));

export function ScheduleWorkspace() {
  const { actorId, grants } = useNavigation();
  return <WorkspaceContent key={scheduleAccessKey(actorId, grants)} />;
}

function WorkspaceContent() {
  const w = useWorkspace();
  const [periodMode, setPeriodMode] = useState<PeriodMode | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  function selectDate(value: string) {
    if (w.busy) return;
    setSelectedDate(value);
    if (!value.startsWith(w.month)) w.changeMonth(value.slice(0, 7));
  }
  // A failed list read on an empty month shows the empty state with creation disabled, not a loader.
  const empty = !!w.orgUnitId && !w.versionsQuery.isPending && !w.versions.length;
  return (
    <div className="min-w-0 space-y-4">
      <div className="hidden md:block">
        <HowItWorks guide="schedule" />
      </div>
      <QueryFeedback {...w.feedback} />
      <Feedback error={readError(w.error)} />
      <CommandRecovery workspace={w} />
      {w.unownedDraft && (
        <Alert>
          <AlertDescription>{t.unownedDraft}</AlertDescription>
        </Alert>
      )}
      {w.store.recoveryError && <Feedback error={t.recovery} />}
      <WorkspaceView
        key={`${w.accessKey}|${w.siteId}|${w.orgUnitId}`}
        workspace={w}
        mode={periodMode}
        onMode={setPeriodMode}
        selectedDate={selectedDate}
        onDate={selectDate}
        empty={empty}
      />
    </div>
  );
}

/** What the one primary button does for the current plan state and rights. */
function primaryAction(w: Workspace) {
  const version = w.version;
  if (!version || w.viewingPublished) return null;
  if (version.status === 'DRAFT') {
    if (w.changes > 0)
      return { kind: 'save' as const, label: `${s.save} (${w.changes})`, enabled: w.allowed.save };
    if (w.rights.publish)
      return { kind: 'review' as const, label: t.reviewPublish, enabled: w.canPublishDraft };
    return { kind: 'submit' as const, label: s.submit, enabled: w.allowed.submit };
  }
  if (version.status === 'IN_REVIEW')
    return w.rights.publish
      ? { kind: 'review' as const, label: t.reviewPublish, enabled: w.allowed.publish }
      : null;
  if (version.status === 'PUBLISHED' && w.canEdit)
    return { kind: 'review' as const, label: t.reviewPublish, enabled: w.allowed.revise };
  return null;
}

function planState(w: Workspace): { tone: Tone; label: string } | null {
  const version = w.version;
  if (!version) return null;
  if (w.viewingPublished || version.status === 'PUBLISHED')
    return { tone: 'success', label: t.publishedState };
  if (version.status === 'DRAFT') return { tone: 'neutral', label: t.draftState };
  if (version.status === 'IN_REVIEW') return { tone: 'warning', label: t.reviewState };
  return { tone: 'neutral', label: s.statuses[version.status] };
}

function WorkspaceView({
  workspace: w,
  mode,
  onMode,
  selectedDate,
  onDate,
  empty,
}: {
  workspace: Workspace;
  mode: PeriodMode | null;
  onMode: (mode: PeriodMode) => void;
  selectedDate: string | null;
  onDate: (date: string) => void;
  empty: boolean;
}) {
  const mobile = useIsMobile();
  const effectiveMode = mobile && mode === 'month' ? 'week' : (mode ?? (mobile ? 'day' : 'week'));
  const today = siteToday(w.timezone);
  const [grouping, setGrouping] = useState<CalendarGrouping>('zones');
  const visibleGrouping: CalendarGrouping = effectiveMode === 'month' ? 'people' : grouping;
  const date = selectedDate?.startsWith(w.month)
    ? selectedDate
    : today.startsWith(w.month)
      ? today
      : `${w.month}-01`;
  const [zone, setZone] = useState('');
  const [batch, setBatch] = useState<{ zoneId: string; date: string } | null>(null);
  const [review, setReview] = useState<{ grid: GridState; versionId: string } | null>(null);
  const [staffingOpen, setStaffingOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const slots = useOpenSlots({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    month: w.month,
    enabled: !!w.version,
  });
  const [workloadTrigger, setWorkloadTrigger] = useState<HTMLElement | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [staffingTrigger, setStaffingTrigger] = useState<HTMLElement | null>(null);
  const { confirm, dialog } = useConfirm();
  const version = w.version;
  const dates = periodDates(w.month, date, effectiveMode);
  const resourceDates = mobile ? calendarWeek(date) : dates;
  const adjacent = useAdjacentPlan({ ...w, dates: effectiveMode === 'month' ? [] : resourceDates });
  const primary = primaryAction(w);
  const state = planState(w);
  async function discard() {
    if (!version || w.commandsBlocked) return;
    const accepted = await confirm({
      title: t.discard,
      description: t.discardHint,
      confirmLabel: t.discard,
    });
    if (accepted !== false) w.store.drop(w.draftKey);
  }
  async function removeDraft() {
    if (!w.allowed.remove) return;
    const accepted = await confirm({
      title: t.deleteDraft,
      description: t.deleteDraftConfirm,
      confirmLabel: t.deleteDraft,
      destructive: true,
    });
    if (accepted !== false) w.commit('remove');
  }
  async function returnDraft() {
    if (!w.allowed.return) return;
    const reason = await confirm({
      title: s.returnToDraft,
      commentLabel: s.returnComment,
      commentRequired: true,
      confirmLabel: s.returnToDraft,
    });
    if (reason) w.commit('return', reason);
  }
  function runPrimary() {
    if (!primary?.enabled || !version) return;
    if (primary.kind === 'save') w.commit('save');
    else if (primary.kind === 'submit') w.commit('submit');
    else setReview({ grid: w.grid, versionId: version.id });
  }
  const canUndo = w.canEdit && w.writable && !!w.store.past[w.draftKey]?.length;
  const canRedo = w.canEdit && w.writable && !!w.store.future[w.draftKey]?.length;
  const canDiscard = w.canEdit && !w.commandsBlocked && (w.changes > 0 || w.stale);
  return (
    <div className="min-w-0 space-y-4">
      <ScheduleToolbar
        sites={w.org?.sites ?? []}
        siteId={w.siteId}
        onSite={w.changeSite}
        units={w.units}
        orgUnitId={w.orgUnitId}
        onUnit={w.changeUnit}
        scopeDisabled={w.busy || !w.org}
        zones={w.zones}
        zoneId={zone}
        onZone={setZone}
        mode={effectiveMode}
        modes={mobile ? ['day', 'week'] : ['day', 'week', 'month']}
        onMode={onMode}
        grouping={visibleGrouping}
        onGrouping={setGrouping}
        month={w.month}
        onMonth={w.changeMonth}
        date={date}
        onDate={onDate}
        today={today}
        busy={w.busy}
      >
        {w.canEdit && (
          <>
            <IconButton
              size="icon"
              variant="outline"
              icon={Undo2Icon}
              label={t.undo}
              tooltip={t.undo}
              disabled={!canUndo}
              onClick={() => {
                if (canUndo) w.store.undo(w.draftKey);
              }}
            />
            <IconButton
              size="icon"
              variant="outline"
              icon={Redo2Icon}
              label={t.redo}
              tooltip={t.redo}
              disabled={!canRedo}
              onClick={() => {
                if (canRedo) w.store.redo(w.draftKey);
              }}
            />
          </>
        )}
        {w.canEdit && (w.changes > 0 || w.stale) && (
          <Button variant="outline" disabled={!canDiscard} onClick={() => void discard()}>
            <XIcon aria-hidden />
            {t.discard}
          </Button>
        )}
        {w.writable && (
          <Button variant="outline" onClick={() => setBatch({ zoneId: zone, date })}>
            <PlusIcon aria-hidden />
            {t.add}
          </Button>
        )}
        {version && version.status === 'IN_REVIEW' && w.rights.publish && (
          <Button variant="outline" disabled={!w.allowed.return} onClick={() => void returnDraft()}>
            {s.returnToDraft}
          </Button>
        )}
        {primary && (
          <Button disabled={!primary.enabled} onClick={runPrimary}>
            {primary.label}
          </Button>
        )}
        {version && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label={t.moreActions}>
                <MoreHorizontalIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {w.writable && (
                <DropdownMenuItem onSelect={() => setCopyOpen(true)}>
                  <CopyIcon aria-hidden="true" />
                  {t.copyPeriod}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  setStaffingTrigger(
                    document.activeElement instanceof HTMLElement ? document.activeElement : null,
                  );
                  setStaffingOpen(true);
                }}
              >
                <UsersIcon aria-hidden="true" />
                {t.staffing}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setWorkloadTrigger(
                    document.activeElement instanceof HTMLElement ? document.activeElement : null,
                  );
                  setWorkloadOpen(true);
                }}
              >
                <BarChart3Icon aria-hidden="true" />
                {t.workload}
              </DropdownMenuItem>
              {w.hasDraft && (
                <DropdownMenuItem
                  disabled={w.busy}
                  onSelect={() => w.showPublished(!w.viewingPublished)}
                >
                  {w.viewingPublished ? t.showDraft : t.showPublished}
                </DropdownMenuItem>
              )}
              {w.rights.edit && version.status === 'DRAFT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!w.allowed.remove}
                    onSelect={() => void removeDraft()}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {t.deleteDraft}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ScheduleToolbar>
      {empty ? (
        <EmptyState
          text={t.empty}
          description={w.rights.edit ? undefined : t.emptyHint}
          action={
            w.rights.edit ? (
              <Button disabled={!w.canCreateDraft} onClick={w.createDraft}>
                {t.create}
              </Button>
            ) : undefined
          }
        />
      ) : (
        version && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {state && <StatusPill tone={state.tone}>{state.label}</StatusPill>}
              {!w.viewingPublished && w.unpublished > 0 && (
                <StatusPill tone="warning">
                  {format(t.unpublishedChanges, { count: w.unpublished })}
                </StatusPill>
              )}
              {w.changes > 0 && !w.viewingPublished && (
                <Muted>
                  {t.localChanges}: {w.changes}
                </Muted>
              )}
              {w.issues.blocked && (
                <StatusPill tone="danger">
                  {format(t.conflictsCount, {
                    count: w.issues.reasons.filter((reason) => reason.severity === 'BLOCK').length,
                  })}
                </StatusPill>
              )}
              {!w.issues.blocked &&
                w.issues.reasons.some((reason) => reason.severity === 'WARN') && (
                  <StatusPill tone="warning">
                    {format(t.warningsCount, {
                      count: w.issues.reasons.filter((reason) => reason.severity === 'WARN').length,
                    })}
                  </StatusPill>
                )}
              {slots.open.length > 0 && (
                <StatusPill tone="info">
                  {format(t.openSlotsCount, { count: slots.open.length })}
                </StatusPill>
              )}
              {w.published?.publishedAt && (
                <Muted>
                  {format(t.publishedAt, {
                    time: recordedTime(w.published.publishedAt, w.timezone),
                  })}
                </Muted>
              )}
              {version.revision > 0 && !w.viewingPublished && (
                <ScheduleExport
                  key={`${version.id}:${version.revision}`}
                  id={version.id}
                  revision={version.revision}
                  refreshing={
                    w.detailQuery.isFetching || w.detailQuery.isError || w.detailQuery.isPaused
                  }
                  refresh={() => {
                    void w.detailQuery.refetch();
                  }}
                  compact
                />
              )}
              {w.writable && !mobile && (
                <Muted>
                  {t.planningHint} {t.dragHint}
                </Muted>
              )}
              {adjacent.months.map((month) => (
                <Muted key={month}>{format(t.otherMonth, { month: monthLabel(month) })}</Muted>
              ))}
              {adjacent.loading && <LoadingState label={t.loadingAdjacent} />}
            </div>
            {adjacent.failed && <Feedback error={t.adjacentUnavailable} />}
            {w.viewingPublished && (
              <p className="text-sm text-muted-foreground">{t.viewingPublished}</p>
            )}
            {version.status === 'DRAFT' && !w.viewingPublished && (
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
            {version.revision === 0 && <Feedback error={t.revisionUnavailable} />}
            {w.stale && !w.pendingCommand && <Feedback error={t.stale} />}
            {w.readOnlyChanges && (
              <section className="space-y-3 rounded-lg border p-3">
                <p>{t.readOnlyChanges}</p>
                <AssignmentChanges
                  changes={assignmentChanges(w.baseline, w.localGrid)}
                  labels={w}
                />
                <Button
                  variant="outline"
                  disabled={w.commandsBlocked}
                  onClick={() => void discard()}
                >
                  {t.discard}
                </Button>
              </section>
            )}
            {w.legacy && w.canEdit && (
              <section className="space-y-3 rounded-lg border p-3">
                <p className="text-sm">{t.legacy}</p>
                <AssignmentChanges
                  changes={assignmentChanges(w.baseline, w.localGrid)}
                  labels={w}
                />
                <Button disabled={!w.canRestoreDraft} onClick={w.restoreLegacy}>
                  {t.restore}
                </Button>
              </section>
            )}
            {w.writable &&
              w.templatesQuery.isSuccess &&
              !w.templates.some((template) => template.isActive) && (
                <Alert>
                  <AlertDescription>{t.missingTemplates}</AlertDescription>
                </Alert>
              )}
            {effectiveMode === 'month' ? (
              <PeopleSchedule workspace={w} zoneId={zone} today={today} />
            ) : (
              <ResourceSchedule
                workspace={w}
                dates={resourceDates}
                grouping={visibleGrouping}
                zoneId={zone}
                selectedDate={date}
                onDate={onDate}
                today={today}
                adjacent={adjacent}
                slots={slots}
              />
            )}
          </>
        )
      )}
      {batch && (
        <BatchPlanner
          workspace={w}
          zoneId={batch.zoneId}
          date={batch.date}
          onClose={() => setBatch(null)}
        />
      )}
      <StaffingSheet
        workspace={w}
        open={staffingOpen}
        onClose={() => setStaffingOpen(false)}
        onRestoreFocus={() => {
          if (staffingTrigger?.isConnected) staffingTrigger.focus();
        }}
        date={date}
      />
      <WorkloadSheet
        workspace={w}
        open={workloadOpen}
        onClose={() => setWorkloadOpen(false)}
        onRestoreFocus={() => {
          if (workloadTrigger?.isConnected) workloadTrigger.focus();
        }}
        weekDates={calendarWeek(date)}
      />
      {copyOpen && (
        <CopyPeriodDialog
          workspace={w}
          weekDates={calendarWeek(date)}
          onClose={() => setCopyOpen(false)}
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
