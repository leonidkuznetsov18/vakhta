import { useState } from 'react';
import { usePersistentState } from '@/lib/ui-store';
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
  PrinterIcon,
  FileClockIcon,
  WandSparklesIcon,
  CircleDashedIcon,
  TriangleAlertIcon,
  OctagonAlertIcon,
  ChevronRightIcon,
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
import { EmptyState, Muted, StatusPill, type PillTone, type Tone } from '@/components/app/page';
import { HowItWorks } from '@/components/app/how-it-works';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { useConfirm } from '@/components/app/confirm-dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { InfoTip } from '@/components/app/info-tip';
import {
  selectableRow,
  type CalendarEmphasis,
  type CalendarSelection,
} from '@/shared/ui/resource-calendar';
import { reasonText } from '../model/use-eligibility';
import { readError } from '@/errors';
import { useNavigation } from '@/navigation';
import { recordedTime } from '../lib/labels';
import { scheduleAccessKey } from '../model/ownership';
import { useWorkspace, type Workspace } from '../model/use-workspace';
import { periodDates, UNASSIGNED_ZONE, type PeriodMode } from '../model/planning';
import { useAdjacentPlan } from '../model/use-adjacent';
import { useOpenSlots } from '../model/use-open-slots';
import { LoadingState } from '@/shared/ui/loading-state';
import { assignmentChanges, assignmentKey, gridToItems, type GridState } from '../model/grid';
import { siteToday, type CalendarGrouping } from '../model/calendar';
import { calendarWeek } from '../model/business-dates';
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
import { RetrospectiveSheet } from './retrospective-sheet';
import { ProposalSheet } from './proposal-sheet';
import { calendarModel } from '../model/calendar';
import { openPrint, printDocument } from '../model/print';
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
  const [periodMode, setPeriodMode] = usePersistentState<PeriodMode | null>(
    `schedule.view:${w.accessKey}:period`,
    null,
  );
  const [selectedDate, setSelectedDate] = usePersistentState<string | null>(
    `schedule.view:${w.accessKey}:date`,
    null,
  );
  function selectDate(value: string) {
    if (w.busy) return;
    setSelectedDate(value);
    if (!value.startsWith(w.month)) w.changeMonth(value.slice(0, 7));
  }
  // Only a received list proves the month has no plan. A failed first read keeps its alert and
  // retry; a failed refresh keeps the last known empty state with creation disabled.
  const empty = !!w.orgUnitId && w.versionsQuery.data !== undefined && !w.versions.length;
  // Until a plan is on screen the calendar area itself carries the one loader.
  const loadingPlan =
    !w.version && !empty && w.feedback.query.isPending && w.feedback.query.isFetching;
  return (
    <div className="min-w-0 space-y-4">
      <div className="hidden md:block">
        <HowItWorks guide="schedule" />
      </div>
      {!loadingPlan && <QueryFeedback {...w.feedback} />}
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
        loading={loadingPlan}
      />
    </div>
  );
}

/** Why the primary button is disabled, in the planner's words; null when it is enabled. */
function primaryReason(w: Workspace, primary: { kind: string; enabled: boolean } | null) {
  if (!primary || primary.enabled) return null;
  if (w.issues.blocked) return t.publishBlockedConflicts;
  if (w.stale) return t.publishBlockedStale;
  if (w.busy || !w.commandReady) return t.publishBlockedBusy;
  if (primary.kind === 'review' && w.version?.status === 'PUBLISHED' && w.changes === 0)
    return t.publishNothing;
  if (primary.kind === 'review' && w.changes > 0 && w.version?.status !== 'PUBLISHED')
    return t.publishSaveFirst;
  return null;
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
  loading,
}: {
  workspace: Workspace;
  mode: PeriodMode | null;
  onMode: (mode: PeriodMode) => void;
  selectedDate: string | null;
  onDate: (date: string) => void;
  empty: boolean;
  loading: boolean;
}) {
  const mobile = useIsMobile();
  const effectiveMode = mobile && mode === 'month' ? 'week' : (mode ?? (mobile ? 'day' : 'week'));
  const today = siteToday(w.timezone);
  const [grouping, setGrouping] = usePersistentState<CalendarGrouping>(
    `schedule.view:${w.accessKey}:${w.orgUnitId}:grouping`,
    'zones',
  );
  const visibleGrouping: CalendarGrouping = effectiveMode === 'month' ? 'people' : grouping;
  const date = selectedDate?.startsWith(w.month)
    ? selectedDate
    : today.startsWith(w.month)
      ? today
      : `${w.month}-01`;
  const [zone, setZone] = usePersistentState(
    `schedule.view:${w.accessKey}:${w.orgUnitId}:zone`,
    '',
  );
  const [batch, setBatch] = useState<{ zoneId: string; date: string } | null>(null);
  const [review, setReview] = useState<{ grid: GridState; versionId: string } | null>(null);
  const [staffingOpen, setStaffingOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [retrospectiveOpen, setRetrospectiveOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalTrigger, setProposalTrigger] = useState<HTMLElement | null>(null);
  const [retrospectiveTrigger, setRetrospectiveTrigger] = useState<HTMLElement | null>(null);
  const [printBlocked, setPrintBlocked] = useState(false);
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
  function print() {
    const model = calendarModel({
      ...w,
      issues: w.issues.reasons,
      dates: resourceDates,
      grouping: visibleGrouping,
      zoneId: zone,
      locale: currentLocale(),
      today,
      writable: false,
      slots: slots.slots,
      published: w.publicationBaseline,
    });
    const html = printDocument({
      model,
      locale: currentLocale(),
      siteName: w.org?.sites.find((site) => site.id === w.siteId)?.name ?? w.siteId,
      unitName: w.units.find((unit) => unit.id === w.orgUnitId)?.name ?? w.orgUnitId,
      period: { from: resourceDates[0] ?? date, to: resourceDates.at(-1) ?? date },
      timezone: w.timezone,
      version: w.version
        ? {
            versionNo: w.version.versionNo,
            status: w.version.status,
            publishedAt: w.version.publishedAt,
          }
        : null,
      unpublished: !w.version || w.version.status !== 'PUBLISHED' || w.unpublished > 0,
      localChanges: w.changes > 0,
      generatedAt: new Date().toISOString(),
    });
    setPrintBlocked(!openPrint(html));
  }
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
  const reason = primaryReason(w, primary);
  const [focus, setFocus] = useState<CalendarEmphasis | null>(null);
  const [hover, setHover] = useState<CalendarEmphasis | null>(null);
  const emphasis = hover ?? focus;
  const [reveal, setReveal] = useState<{
    readonly employeeId: string;
    readonly businessDate: string;
    readonly selection: CalendarSelection;
  } | null>(null);
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((item) => item.id === id)?.name ?? id,
    employeeName: (id: string) => w.employees.find((item) => item.id === id)?.fullName ?? id,
  };
  /** Issues of one severity, and how many of them fall inside the visible period. */
  const issuesOf = (severity: 'WARN' | 'BLOCK') =>
    w.issues.reasons
      .filter((item) => item.severity === severity)
      .sort(
        (a, b) =>
          a.businessDate.localeCompare(b.businessDate) ||
          labels.employeeName(a.employeeId).localeCompare(labels.employeeName(b.employeeId)),
      );
  const visibleIssues = (severity: 'WARN' | 'BLOCK') =>
    issuesOf(severity).filter((item) => dates.includes(item.businessDate)).length;
  const issueDate = new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  /** Opens the shift behind an issue: moves the period there and selects the card. */
  function revealIssue(item: { readonly employeeId: string; readonly businessDate: string }) {
    const shift = gridToItems(w.grid).find(
      (value) => value.employeeId === item.employeeId && value.businessDate === item.businessDate,
    );
    onDate(item.businessDate);
    if (shift && zone && (shift.zoneId ?? UNASSIGNED_ZONE) !== zone) setZone('');
    setReveal({
      employeeId: item.employeeId,
      businessDate: item.businessDate,
      selection: {
        resourceId:
          visibleGrouping === 'zones' ? (shift?.zoneId ?? UNASSIGNED_ZONE) : item.employeeId,
        date: item.businessDate,
        ...(shift ? { itemId: assignmentKey(shift) } : {}),
      },
    });
  }
  const pill = (
    kind: CalendarEmphasis,
    tone: PillTone,
    Icon: typeof CircleDashedIcon,
    label: string,
    title: string,
  ) => (
    <StatusPill tone={tone} asChild>
      <button
        type="button"
        aria-pressed={focus === kind}
        title={
          focus === kind
            ? t.highlightOff
            : kind !== 'unpublished' && effectiveMode !== 'month' && visibleIssues(kind) === 0
              ? t.highlightNoneVisible
              : title
        }
        className={`inline-flex cursor-pointer items-center gap-1 transition-shadow hover:ring-2 hover:ring-sky-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${focus === kind ? 'ring-2 ring-sky-600' : ''}`}
        onMouseEnter={() => setHover(kind)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(kind)}
        onBlur={() => setHover(null)}
        onClick={() => setFocus((current) => (current === kind ? null : kind))}
      >
        <Icon aria-hidden className="size-3.5" />
        {label}
      </button>
    </StatusPill>
  );
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
        {reason && <InfoTip text={reason} />}
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
              <DropdownMenuItem
                onSelect={() => {
                  setRetrospectiveTrigger(
                    document.activeElement instanceof HTMLElement ? document.activeElement : null,
                  );
                  setRetrospectiveOpen(true);
                }}
              >
                <FileClockIcon aria-hidden="true" />
                {t.retrospective}
              </DropdownMenuItem>
              {w.writable && slots.open.length > 0 && (
                <DropdownMenuItem
                  onSelect={() => {
                    setProposalTrigger(
                      document.activeElement instanceof HTMLElement ? document.activeElement : null,
                    );
                    setProposalOpen(true);
                  }}
                >
                  <WandSparklesIcon aria-hidden="true" />
                  {t.proposal}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={print}>
                <PrinterIcon aria-hidden="true" />
                {t.print}
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
      {loading ? (
        <LoadingState
          label={messages(currentLocale()).ui.common.loading}
          className="w-full py-12"
        />
      ) : w.org && !w.orgUnitId ? (
        <EmptyState text={t.emptyHint} />
      ) : empty ? (
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
              {!w.viewingPublished &&
                w.unpublished > 0 &&
                pill(
                  'unpublished',
                  'neutral',
                  CircleDashedIcon,
                  format(t.unpublishedChanges, { count: w.unpublished }),
                  t.highlightUnpublished,
                )}
              {w.changes > 0 && !w.viewingPublished && (
                <Muted>
                  {t.localChanges}: {w.changes}
                </Muted>
              )}
              {w.issues.blocked &&
                pill(
                  'BLOCK',
                  'danger',
                  OctagonAlertIcon,
                  format(t.conflictsCount, {
                    count: w.issues.reasons.filter((item) => item.severity === 'BLOCK').length,
                  }),
                  t.highlightConflicts,
                )}
              {w.issues.reasons.some((item) => item.severity === 'WARN') &&
                pill(
                  'WARN',
                  'caution',
                  TriangleAlertIcon,
                  format(t.warningsCount, {
                    count: w.issues.reasons.filter((item) => item.severity === 'WARN').length,
                  }),
                  t.highlightWarnings,
                )}
              {(w.unpublished > 0 || w.issues.reasons.length > 0) && !w.viewingPublished && (
                <InfoTip text={t.highlightHint} />
              )}
              {slots.open.length > 0 && (
                <StatusPill tone="teal">
                  <CircleDashedIcon aria-hidden className="size-3.5" />
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
              {w.writable && !mobile && <InfoTip text={`${t.planningHint} ${t.dragHint}`} />}
              {adjacent.months.map((month) => (
                <Muted key={month}>{format(t.otherMonth, { month: monthLabel(month) })}</Muted>
              ))}
              {adjacent.loading && <LoadingState label={t.loadingAdjacent} />}
            </div>
            {focus === 'unpublished' && (
              <section
                className="space-y-2 rounded-lg border p-3"
                aria-label={t.unpublishedChanges.split(':')[0] ?? t.unpublishedChanges}
              >
                <AssignmentChanges
                  changes={assignmentChanges(w.publicationBaseline, w.grid)}
                  labels={w}
                />
              </section>
            )}
            {(focus === 'WARN' || focus === 'BLOCK') && (
              <section
                className="space-y-2 rounded-lg border p-3 text-sm"
                aria-label={focus === 'BLOCK' ? t.conflict : t.warning}
              >
                <Muted>
                  {format(t.issuesElsewhere, {
                    visible:
                      effectiveMode === 'month' ? issuesOf(focus).length : visibleIssues(focus),
                    count: issuesOf(focus).length,
                  })}
                </Muted>
                <ul className="max-h-72 divide-y overflow-y-auto">
                  {issuesOf(focus).map((item, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className={`${selectableRow} flex w-full items-center gap-3 px-2 py-1.5 text-left`}
                        onClick={() => revealIssue(item)}
                      >
                        <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                          {issueDate.format(new Date(`${item.businessDate}T00:00:00Z`))}
                        </span>
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <span className="font-medium">
                            {labels.employeeName(item.employeeId)}
                          </span>
                          <span
                            className={
                              focus === 'BLOCK'
                                ? ' text-red-700 dark:text-red-300'
                                : ' text-orange-800 dark:text-orange-200'
                            }
                          >
                            {' · '}
                            {reasonText(item, labels)}
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
              <PeopleSchedule workspace={w} zoneId={zone} today={today} reveal={reveal} />
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
                emphasis={emphasis}
                reveal={reveal?.selection ?? null}
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
      {printBlocked && <Feedback error={t.printBlocked} />}
      <ProposalSheet
        workspace={w}
        slots={slots}
        open={proposalOpen}
        onClose={() => setProposalOpen(false)}
        onRestoreFocus={() => {
          if (proposalTrigger?.isConnected) proposalTrigger.focus();
        }}
      />
      <RetrospectiveSheet
        workspace={w}
        open={retrospectiveOpen}
        onClose={() => setRetrospectiveOpen(false)}
        onRestoreFocus={() => {
          if (retrospectiveTrigger?.isConnected) retrospectiveTrigger.focus();
        }}
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
