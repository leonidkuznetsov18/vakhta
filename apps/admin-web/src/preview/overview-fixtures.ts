import type { OverviewEvent, OverviewSnapshot } from '@vakhta/contracts';

/**
 * Synthetic Overview answers for the preview shell (spec 004 screenshots): a running day shift
 * at one plant with a silent kiosk, two people not recorded, a zone standing and handover in
 * progress. `?overview=failed|loading|clear|night` switches the state under inspection.
 */
const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const UNIT_2 = 'a0000000-0000-4000-8000-000000000012';
const ZONE = 'a0000000-0000-4000-8000-000000000003';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Local 08:00 at Kyiv today as an instant; the preview runs at any wall time. */
function kyivToday(hour: number, dayOffset = 0): number {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(now);
  const base = Date.parse(`${date}T00:00:00Z`) + dayOffset * 86_400_000;
  const offset =
    now.getTime() -
    Date.parse(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }) + ' UTC');
  return base + hour * 3_600_000 + offset;
}

export function overviewSnapshotFixture(
  mode: string | null,
  unitScoped: boolean,
): OverviewSnapshot {
  const now = Date.now();
  const night = mode === 'night';
  const start = night ? now - 3 * 3_600_000 : kyivToday(8);
  const end = start + 12 * 3_600_000;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
    new Date(start),
  );
  const window = (name: string, code: string, s: number, isNight: boolean) => ({
    templateId:
      code === 'DAY'
        ? 'a0000000-0000-4000-8000-0000000000d1'
        : 'a0000000-0000-4000-8000-0000000000d2',
    code,
    name,
    isNight,
    businessDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(s)),
    startsAt: iso(s),
    endsAt: iso(s + 12 * 3_600_000),
    closesAt: iso(s + 14 * 3_600_000),
  });
  const clear = mode === 'clear';
  return {
    generatedAt: iso(now),
    lateGraceMinutes: 10,
    downtimeEscalationMinutes: 15,
    options: {
      sites: [{ id: SITE, name: 'Основная площадка' }],
      orgUnits: unitScoped
        ? [{ id: UNIT, siteId: SITE, name: 'Цех Крышки' }]
        : [
            { id: UNIT, siteId: SITE, name: 'Цех Крышки' },
            { id: UNIT_2, siteId: SITE, name: 'Пакувальна дільниця' },
          ],
    },
    selection: { siteId: null, orgUnitId: null },
    contexts: [
      {
        siteId: SITE,
        siteName: 'Основная площадка',
        timezone: 'Europe/Kyiv',
        current: night
          ? window('Нічна', 'NIGHT', start, true)
          : window('Денна', 'DAY', start, false),
        closingPrevious:
          night || now - start > 2 * 3_600_000
            ? null
            : window('Нічна', 'NIGHT', start - 12 * 3_600_000, true),
        next: night ? window('Денна', 'DAY', end, false) : window('Нічна', 'NIGHT', end, true),
      },
    ],
    staffing: {
      planned: clear ? 12 : 44,
      present: clear ? 12 : 41,
      notArrived: clear ? 0 : 2,
      expected: clear ? 0 : 1,
      unscheduled: clear ? 0 : 1,
      notArrivedPeople: clear
        ? []
        : [
            {
              employeeId: 'b0000000-0000-4000-8000-0000000000a1',
              fullName: 'Іванов Олег',
              planStartAt: iso(start),
              zoneName: 'Токарний №2',
            },
            {
              employeeId: 'b0000000-0000-4000-8000-000000000003',
              fullName: 'Петренко Ірина',
              planStartAt: iso(start),
              zoneName: 'Пакувальна лінія',
            },
          ],
      unscheduledPeople: clear
        ? []
        : [
            {
              employeeId: 'b0000000-0000-4000-8000-0000000000a3',
              fullName: 'Гринько Юлія',
              planStartAt: null,
              zoneName: 'Лінія 1',
            },
          ],
      oldestNotArrivedSince: clear ? null : iso(start),
      businessDate: date,
    },
    downtime: clear
      ? { zoneMinutes: 0, personMinutes: 0, incidents: 0, topReason: null, byZone: [] }
      : {
          zoneMinutes: 45,
          personMinutes: 75,
          incidents: 2,
          topReason: { code: 'AIR', label: 'Аварія пневматики', minutes: 32 },
          byZone: [{ zoneId: ZONE, zoneName: 'Токарний №2', minutes: 32 }],
        },
    timeToAction: clear
      ? {
          reported: 0,
          acknowledged: 0,
          medianMinutes: null,
          slaMet: 0,
          slaMissed: 0,
          awaiting: 0,
          awaitingBreached: 0,
        }
      : {
          reported: 6,
          acknowledged: 5,
          medianMinutes: 4,
          slaMet: 5,
          slaMissed: 1,
          awaiting: 1,
          awaitingBreached: 1,
        },
    handover: clear
      ? { clean: 12, decided: 12, disputed: 0, pending: 0 }
      : { clean: 49, decided: 50, disputed: 1, pending: 3 },
    terminals: [
      {
        id: 'a0000000-0000-4000-8000-0000000000t1',
        siteId: SITE,
        name: 'Прохідна 1',
        connectivity: clear ? 'ONLINE' : 'OFFLINE',
        lastSeenAt: iso(clear ? now - 30_000 : now - 6 * 60_000),
        critical: !clear,
      },
    ],
    zones: [
      ...(clear
        ? []
        : [
            {
              zoneId: ZONE,
              zoneName: 'Токарний №2',
              orgUnitId: UNIT,
              orgUnitName: 'Цех Крышки',
              siteId: SITE,
              status: 'DOWNTIME' as const,
              planned: 2,
              present: 2,
              since: iso(now - 32 * 60_000),
            },
            {
              zoneId: 'a0000000-0000-4000-8000-0000000000z2',
              zoneName: 'Пакувальна лінія',
              orgUnitId: UNIT_2,
              orgUnitName: 'Пакувальна дільниця',
              siteId: SITE,
              status: 'UNDERSTAFFED' as const,
              planned: 3,
              present: 2,
              since: null,
            },
          ]),
      {
        zoneId: 'a0000000-0000-4000-8000-0000000000z3',
        zoneName: 'Лінія 1',
        orgUnitId: UNIT,
        orgUnitName: 'Цех Крышки',
        siteId: SITE,
        status: 'WORKING',
        planned: 4,
        present: 4,
        since: null,
      },
      {
        zoneId: 'a0000000-0000-4000-8000-0000000000z4',
        zoneName: 'Склад готової продукції з дуже довгою назвою для перевірки переносу',
        orgUnitId: UNIT_2,
        orgUnitName: 'Пакувальна дільниця',
        siteId: SITE,
        status: 'CLOSING',
        planned: 1,
        present: 1,
        since: null,
      },
      {
        zoneId: 'a0000000-0000-4000-8000-0000000000z5',
        zoneName: 'Резервна лінія',
        orgUnitId: UNIT,
        orgUnitName: 'Цех Крышки',
        siteId: SITE,
        status: 'IDLE',
        planned: 0,
        present: 0,
        since: null,
      },
    ],
    setup: { unlinkedEmployees: clear ? 0 : 93, unpairedTerminals: clear ? 0 : 1 },
  };
}

export function overviewEventsFixture(): OverviewEvent[] {
  const now = Date.now();
  const at = (minutes: number) => iso(now - minutes * 60_000);
  return [
    {
      id: 'a0000000-0000-4000-8000-0000000000e1',
      kind: 'DOWNTIME_STARTED',
      at: at(32),
      zoneName: 'Токарний №2',
      employeeName: 'Іванов Олег',
      reasonLabel: 'Аварія пневматики',
      target: { section: 'operations', id: null, businessDate: null },
    },
    {
      id: 'a0000000-0000-4000-8000-0000000000e2',
      kind: 'HANDOVER_DECIDED',
      at: at(35),
      zoneName: 'Пакувальна лінія',
      employeeName: 'Петров Віктор',
      reasonLabel: null,
      target: { section: 'handover', id: null, businessDate: null },
    },
    {
      id: 'a0000000-0000-4000-8000-0000000000e3',
      kind: 'INCIDENT_SLA_BREACHED',
      at: at(47),
      zoneName: 'Лінія 1',
      employeeName: null,
      reasonLabel: 'Безпека',
      target: { section: 'incidents', id: null, businessDate: null },
    },
    {
      id: 'a0000000-0000-4000-8000-0000000000e4',
      kind: 'INCIDENT_ACKNOWLEDGED',
      at: at(52),
      zoneName: 'Токарний №2',
      employeeName: 'Ткач Олена',
      reasonLabel: 'Нема матеріалу',
      target: { section: 'incidents', id: null, businessDate: null },
    },
  ];
}

/** Answers Overview requests in the preview; null for any other path. */
export function overviewPreview(
  path: string,
  search: string,
  unitScoped: boolean,
): Promise<Response> | Response | null {
  const mode = new URLSearchParams(search || location.search).get('overview');
  if (path === '/admin/overview') {
    if (mode === 'failed')
      return json({ statusCode: 503, code: 'UNAVAILABLE', message: 'Unavailable' }, 503);
    if (mode === 'loading') return new Promise<Response>(() => undefined);
    return json(overviewSnapshotFixture(mode, unitScoped));
  }
  if (path === '/admin/schedules/staffing/attention') {
    const day = (offset: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
        new Date(Date.now() + offset * 86_400_000),
      );
    return json(
      mode === 'clear'
        ? { today: day(0), holiday: null, birthdaysToday: [], onSickLeave: [], replacements: [] }
        : {
            today: day(0),
            holiday: null,
            birthdaysToday: ['b0000000-0000-4000-8000-000000000002'],
            onSickLeave: [
              {
                requestId: 'a0000000-0000-4000-8000-0000000000c1',
                employeeId: 'b0000000-0000-4000-8000-000000000001',
                type: 'SICK',
                status: 'APPROVED',
                from: day(-2),
                to: day(3),
                lastCheckin: {
                  businessDate: day(0),
                  answer: 'WORSE',
                  answeredAt: new Date().toISOString(),
                },
              },
              {
                requestId: 'a0000000-0000-4000-8000-0000000000c2',
                employeeId: 'b0000000-0000-4000-8000-000000000003',
                type: 'SICK',
                status: 'PENDING',
                from: day(0),
                to: day(1),
                lastCheckin: null,
              },
            ],
            replacements: [
              {
                assignmentId: 'a0000000-0000-4000-8000-0000000000d1',
                employeeId: 'b0000000-0000-4000-8000-000000000001',
                businessDate: day(1),
                zoneId: ZONE,
                orgUnitId: UNIT,
                requestId: 'a0000000-0000-4000-8000-0000000000c1',
                type: 'SICK',
              },
              {
                assignmentId: 'a0000000-0000-4000-8000-0000000000d2',
                employeeId: 'b0000000-0000-4000-8000-000000000001',
                businessDate: day(2),
                zoneId: ZONE,
                orgUnitId: UNIT,
                requestId: 'a0000000-0000-4000-8000-0000000000c1',
                type: 'SICK',
              },
              {
                assignmentId: 'a0000000-0000-4000-8000-0000000000d3',
                employeeId: 'b0000000-0000-4000-8000-000000000003',
                businessDate: day(1),
                zoneId: null,
                orgUnitId: UNIT_2,
                requestId: 'a0000000-0000-4000-8000-0000000000c2',
                type: 'SICK',
              },
            ],
          },
    );
  }
  if (path === '/admin/overview/events')
    return json(mode === 'clear' ? [] : overviewEventsFixture());
  return null;
}
