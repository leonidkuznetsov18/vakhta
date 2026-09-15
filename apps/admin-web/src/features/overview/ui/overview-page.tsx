import type { ActiveShiftView, MeView, OverviewZone } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { handoversApi, incidentsApi, requestsApi, shiftsApi } from '@/api';
import { Muted } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { useNow } from '@/lib/clock';
import { useLiveUpdates } from '@/lib/live';
import { setUiState } from '@/lib/ui-store';
import { useEmployees } from '@/lib/org';
import { useNavigation, type SectionKey } from '@/navigation';
import { attentionPermissions, useAttention } from '../model/queries';
import {
  attentionFilters,
  type OverviewPlanningTarget,
  type OverviewSelection,
} from '../model/destination';
import {
  buildActionQueue,
  composition,
  setupItems,
  type QueueItem,
  type SetupItem,
} from '../model/priority';
import { useOverviewSelection, useOverviewSnapshot } from '../model/snapshot';
import { useTeamToday } from '../model/team-today';
import { overviewText } from '../model/time';
import { ActionQueue } from './action-queue';
import { EventFeed } from './event-feed';
import { SetupSection, type UnscheduledGroup } from './setup-section';
import { ShiftHeader } from './shift-header';
import { ShiftHealth, type HealthTarget } from './shift-health';
import { TeamToday } from './team-today';
import { ZoneBoard } from './zone-board';

const QUEUE_SECTION: Partial<Record<QueueItem['key'], SectionKey>> = {
  slaBreached: 'incidents',
  safetyIncidents: 'incidents',
  openIncidents: 'incidents',
  pendingHandovers: 'handover',
  overdueRequests: 'requests',
  requestsForMe: 'requests',
  overtimePending: 'requests',
  closedNoChecklist: 'operations',
};

/**
 * "Overview": the exception-based action center of the current shift (spec 004). The header says
 * where and when; the queue says what to do first; health, zones and events say how the shift is
 * going; setup debt stays apart. Lists feed the queue through shared caches, the server snapshot
 * feeds the facts, and live streams mark both stale.
 */
export function OverviewPage({
  me,
  onPlanPeople,
}: {
  readonly me: MeView;
  readonly onPlanPeople: (target: OverviewPlanningTarget) => void;
}) {
  const c = overviewText();
  const old = messages(currentLocale()).admin.overview;
  const now = useNow();
  const { go } = useNavigation();
  const [selection, setSelection] = useOverviewSelection();
  const attention = useAttention(me);
  const permissions = attentionPermissions(me);
  const snapshotQuery = useOverviewSnapshot(me, selection);
  const snapshot = snapshotQuery.data;
  const snapshotEnabled = me.id !== '' && me.roles.length > 0;

  // One connection per stream; each event marks its list and the snapshot stale (AC-024).
  const liveShifts = useLiveUpdates(shiftsApi.streamUrl(), 'shift', ['shifts'], [['overview']]);
  const liveIncidents = useLiveUpdates(
    incidentsApi.streamUrl(),
    'incident',
    ['incidents'],
    [['overview']],
  );
  const liveHandovers = useLiveUpdates(
    handoversApi.streamUrl(),
    'handover',
    ['handovers'],
    [['overview']],
  );
  const liveRequests = useLiveUpdates(
    requestsApi.streamUrl(),
    'request',
    ['requests'],
    [['overview']],
  );
  const live = [
    permissions.shifts ? liveShifts : true,
    permissions.incidents ? liveIncidents : true,
    permissions.handovers ? liveHandovers : true,
    permissions.requests ? liveRequests : true,
  ].every(Boolean);

  const queue = buildActionQueue({
    attention: attention.data,
    permissions,
    snapshot: snapshotQuery.isError && !snapshot ? undefined : snapshot,
    snapshotEnabled: snapshotEnabled && !snapshotQuery.isPending,
    now,
  });
  const blocks = composition(permissions, snapshot);
  const setup = setupItems(snapshot);
  const groups = groupByUnit(attention.data.unscheduledPeople);
  const updated =
    [attention.data.refreshedAt, snapshot ? new Date(snapshotQuery.dataUpdatedAt) : null]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const businessDate =
    snapshot?.staffing?.businessDate ??
    snapshot?.contexts.find((x) => x.current)?.current?.businessDate ??
    '';

  function select(next: OverviewSelection): void {
    setSelection(next);
  }

  function retry(): void {
    void attention.refresh();
    void snapshotQuery.refetch();
  }

  function operations(values: Record<string, unknown>, openId: string | null = null): void {
    setUiState({
      'operations.scope': 'OPEN',
      'operations.day': businessDate,
      'operations.siteId': selection.siteId ?? '',
      'operations.orgUnitId': selection.orgUnitId ?? '',
      'operations.group': 'ALL',
      'search.operations': '',
      ...values,
    });
    go('operations', openId ?? undefined);
  }

  function openQueue(item: QueueItem): void {
    const section = QUEUE_SECTION[item.key];
    if (
      section &&
      item.key !== 'terminalsOffline' &&
      item.key !== 'longDowntime' &&
      item.key !== 'notArrived'
    ) {
      setUiState(attentionFilters(item.key, attention.data, selection));
      go(section, attention.data.firstId[item.key]);
      return;
    }
    if (item.key === 'terminalsOffline') return openTerminals();
    if (item.key === 'longDowntime') return operations({ 'operations.group': 'DOWNTIME' });
    // Not arrived: the live-shift screen is where a master starts a shift for an employee.
    operations({ 'operations.scope': 'ALL' });
  }

  function openTerminals(): void {
    setUiState({ 'search.terminals': '', 'terminals.openId': null });
    go('administration', 'terminals');
  }

  function openHealth(target: HealthTarget): void {
    if (target === 'staffing') return operations({});
    if (target === 'downtime') return operations({ 'operations.group': 'DOWNTIME' });
    if (target === 'schedule') return go('schedule');
    if (target === 'timeToAction') {
      setUiState(attentionFilters('openIncidents', attention.data, selection));
      setUiState({
        'incidents.scope': 'all',
        'incidents.period': 'today',
      });
      return go('incidents');
    }
    setUiState(attentionFilters('pendingHandovers', attention.data, selection));
    go('handover');
  }

  function openZone(zone: OverviewZone): void {
    operations({
      'operations.orgUnitId': zone.orgUnitId,
      'operations.siteId': zone.siteId,
      'search.operations': zone.zoneName,
    });
  }

  function openSetup(item: SetupItem): void {
    if (item.key === 'unpairedTerminals') return openTerminals();
    setUiState(attentionFilters('unlinkedEmployees', attention.data, selection));
    go('administration', 'employees');
  }

  function planFor(group: UnscheduledGroup): void {
    const people = attention.data.unscheduledPeople.filter(
      (p) => (p.orgUnitId ?? null) === group.orgUnitId,
    );
    onPlanPeople({ orgUnitId: group.orgUnitId, people });
  }

  // People facts of the schedule slice (sick leave, unfilled shifts, birthdays), one read per site.
  const roster = useEmployees(permissions.employees);
  const attentionSites = !snapshot
    ? []
    : selection.siteId
      ? [selection.siteId]
      : snapshot.contexts.map((ctx) => ctx.siteId);

  const teamToday = useTeamToday(attentionSites, permissions.employees);

  const snapshotState = snapshot ? 'ready' : snapshotQuery.isError ? 'failed' : 'loading';
  const queueLoading =
    attention.data.refreshedAt === null || (snapshotEnabled && snapshotQuery.isPending);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ShiftHeader
        snapshot={snapshot}
        selection={selection}
        onSelect={select}
        live={live}
        updatedAt={updated}
        now={now}
        failed={snapshotQuery.isError}
        onRetry={retry}
      />
      {blocks.queue && (
        <ActionQueue
          queue={queue}
          loading={queueLoading}
          escalationMinutes={snapshot?.downtimeEscalationMinutes ?? 15}
          now={now}
          onOpen={openQueue}
          onRetry={retry}
        />
      )}
      {(blocks.health || snapshotState !== 'ready') && (
        <ShiftHealth
          snapshot={snapshot}
          state={snapshotState}
          onOpen={openHealth}
          onRetry={retry}
        />
      )}
      {blocks.zones && snapshot?.zones && (
        <ZoneBoard zones={snapshot.zones} now={now} onOpen={openZone} />
      )}
      {permissions.employees && attentionSites.length > 0 && (
        <TeamToday
          team={teamToday.team}
          loading={teamToday.loading}
          failed={teamToday.failed}
          employees={roster.employees}
          snapshot={snapshot}
          onOpenSchedule={() => go('schedule')}
          onRetry={() => void teamToday.refetch()}
        />
      )}
      {blocks.feed && <EventFeed me={me} selection={selection} now={now} />}
      {blocks.setup && (
        <SetupSection
          items={setup}
          groups={permissions.shifts ? groups : []}
          noUnit={old.noUnit}
          onOpen={openSetup}
          onPlan={planFor}
        />
      )}
      {blocks.linksOnly && <Muted>{c.readOnlyHint}</Muted>}
    </div>
  );
}

function groupByUnit(people: readonly ActiveShiftView[]): UnscheduledGroup[] {
  const groups = new Map<
    string,
    { orgUnitId: string | null; orgUnitName: string | null; people: ActiveShiftView[] }
  >();
  for (const person of people) {
    const key = person.orgUnitId ?? '';
    const group = groups.get(key) ?? {
      orgUnitId: person.orgUnitId,
      orgUnitName: person.orgUnitName,
      people: [],
    };
    group.people.push(person);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.orgUnitName ?? '').localeCompare(b.orgUnitName ?? ''))
    .map((g) => ({
      orgUnitId: g.orgUnitId,
      orgUnitName: g.orgUnitName,
      people: g.people.map((p) => ({
        id: p.id,
        name: p.fullName,
        seed: p.id,
        note: p.personnelNumber,
      })),
    }));
}
