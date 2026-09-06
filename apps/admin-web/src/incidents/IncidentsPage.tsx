import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IncidentDetailView,
  IncidentStatsView,
  IncidentView,
  OrgSnapshot,
} from '@vakhta/contracts';
import {
  allowedIncidentTransitions,
  type IncidentSeverity,
  type IncidentStatus,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { formatTime } from '@/lib/format';
import { incidentsApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

const SEVERITY_TONE: Record<IncidentSeverity, Tone> = {
  NORMAL: 'neutral',
  CRITICAL: 'warning',
  SAFETY: 'danger',
};
const STATUS_TONE: Record<IncidentStatus, Tone> = {
  REPORTED: 'danger',
  ACKNOWLEDGED: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  DUPLICATE: 'neutral',
  REJECTED: 'neutral',
};

function dayStart(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/** "Downtime and incidents" (spec 9.1): the master queue with SSE, actions per the transition table, statistics. */
export function IncidentsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = useState('');
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [rows, setRows] = useState<IncidentView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDetailView | null>(null);
  const [target, setTarget] = useState<Record<string, IncidentStatus | ''>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [duplicateOf, setDuplicateOf] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<IncidentStatsView | null>(null);
  const [from, setFrom] = useState(() =>
    dayStart(new Date(Date.now() - 6 * 86_400_000)).slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    setRows(await incidentsApi.list({ ...(siteId ? { siteId } : {}), scope }));
  }, [siteId, scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(incidentsApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('incident', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    incidentsApi
      .detail(openId)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  const loadStats = useCallback(() => {
    const toExclusive = new Date(`${to}T00:00:00`);
    toExclusive.setDate(toExclusive.getDate() + 1);
    incidentsApi
      .stats(
        new Date(`${from}T00:00:00`).toISOString(),
        toExclusive.toISOString(),
        siteId || undefined,
      )
      .then(setStats)
      .catch((e: unknown) => setError(describeError(e)));
  }, [from, to, siteId]);

  useEffect(() => {
    loadStats();
  }, [loadStats, rows]);

  function apply(row: IncidentView) {
    const to = target[row.id];
    if (!to) return;
    const text = (comment[row.id] ?? '').trim();
    const dup = duplicateOf[row.id];
    setBusy(true);
    setError(null);
    setNotice(null);
    incidentsApi
      .transition(row.id, {
        to,
        ...(text ? { comment: text } : {}),
        ...(to === 'DUPLICATE' && dup ? { duplicateOfId: dup } : {}),
      })
      .then(async () => {
        setNotice(i.applied);
        setComment((c) => ({ ...c, [row.id]: '' }));
        setTarget((t) => ({ ...t, [row.id]: '' }));
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const others = (row: IncidentView) =>
    rows.filter((r) => r.id !== row.id && r.status !== 'DUPLICATE');

  const columns: Column<IncidentView>[] = [
    {
      key: 'opened',
      header: i.opened,
      cell: (row) => <span className="tabular-nums">{formatTime(row.openedAt)}</span>,
    },
    {
      key: 'severity',
      header: i.severity,
      cell: (row) => (
        <StatusPill tone={SEVERITY_TONE[row.severity]}>
          {all.incidents.severities[row.severity]}
        </StatusPill>
      ),
    },
    {
      key: 'reason',
      header: i.reason,
      cell: (row) => (
        <div>
          <div>{row.reasonLabel}</div>
          {row.lastComment && <Muted>{row.lastComment}</Muted>}
        </div>
      ),
    },
    { key: 'zone', header: i.zone, cell: (row) => row.zoneName ?? '—' },
    { key: 'reports', header: i.reports, align: 'right', cell: (row) => row.reportsCount },
    { key: 'stopped', header: i.stoppedNow, align: 'right', cell: (row) => row.stoppedNow },
    {
      key: 'status',
      header: i.status,
      cell: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]}>{all.incidents.statuses[row.status]}</StatusPill>
      ),
    },
    {
      key: 'sla',
      header: (
        <span className="inline-flex items-center gap-1">
          {i.sla}
          <InfoTip text={hints.incidentsSla} />
        </span>
      ),
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <span className="tabular-nums">{formatTime(row.slaDueAt)}</span>
          {row.slaBreached && <StatusPill tone="danger">{i.slaBreached}</StatusPill>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpenId(openId === row.id ? null : row.id)}
        >
          {i.detail}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <SelectField
          label={i.site}
          value={siteId}
          onChange={setSiteId}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <div className="flex items-center gap-1">
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'open' | 'all')}>
            <TabsList>
              <TabsTrigger value="open">{i.scopeOpen}</TabsTrigger>
              <TabsTrigger value="all">{i.scopeAll}</TabsTrigger>
            </TabsList>
          </Tabs>
          <InfoTip text={hints.incidentsScope} />
        </div>
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} notice={notice} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={i.empty}
        rowClassName={(row) => (row.slaBreached ? 'bg-red-50/60 dark:bg-red-950/30' : undefined)}
        expanded={(row) =>
          openId === row.id ? (
            <div className="flex flex-col gap-4">
              {allowedIncidentTransitions(row.status).length > 0 && (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    apply(row);
                  }}
                >
                  <SelectField
                    label={i.status}
                    value={target[row.id] ?? ''}
                    onChange={(v) => setTarget((t) => ({ ...t, [row.id]: v as IncidentStatus }))}
                    placeholder="…"
                    required
                    options={allowedIncidentTransitions(row.status).map((s) => ({
                      value: s,
                      label: i.transitions[s],
                    }))}
                    className="w-56"
                  />
                  {target[row.id] === 'DUPLICATE' && (
                    <SelectField
                      label={i.duplicateOf}
                      hint={hints.incidentsDuplicate}
                      value={duplicateOf[row.id] ?? ''}
                      onChange={(v) => setDuplicateOf((d) => ({ ...d, [row.id]: v }))}
                      placeholder="…"
                      required
                      options={others(row).map((o) => ({
                        value: o.id,
                        label: `${formatTime(o.openedAt)} · ${o.reasonLabel} · ${o.zoneName ?? '—'}`,
                      }))}
                      className="w-72"
                    />
                  )}
                  <FormField
                    label={
                      target[row.id] === 'RESOLVED' || target[row.id] === 'REJECTED'
                        ? i.commentRequired
                        : i.comment
                    }
                    className="min-w-72 flex-1"
                  >
                    {(id) => (
                      <Input
                        id={id}
                        value={comment[row.id] ?? ''}
                        onChange={(e) => setComment((c) => ({ ...c, [row.id]: e.target.value }))}
                        required={target[row.id] === 'RESOLVED' || target[row.id] === 'REJECTED'}
                        minLength={3}
                      />
                    )}
                  </FormField>
                  <Button type="submit" variant="secondary" disabled={busy || !target[row.id]}>
                    {i.apply}
                  </Button>
                </form>
              )}
              {detail && detail.incident.id === row.id && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{i.reportsTitle}</h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {detail.reports.map((r) => (
                        <li key={r.id}>
                          <span className="tabular-nums">{formatTime(r.reportedAt)}</span>{' '}
                          <strong>{r.fullName}</strong>{' '}
                          <Muted>
                            {`${r.stoppedWork ? i.stoppedWork : i.notStopped}${r.hasPhoto ? ` · ${i.photo}` : ''}${r.comment ? ` · ${r.comment}` : ''}`}
                          </Muted>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{i.history}</h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {detail.history.map((h) => (
                        <li key={h.id}>
                          <span className="tabular-nums">{formatTime(h.at)}</span>{' '}
                          {all.incidents.statuses[h.toStatus]}
                          <Muted>{` · ${h.actorType}${h.comment ? ` · ${h.comment}` : ''}`}</Muted>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : null
        }
      />

      <Section title={i.stats} hint={hints.incidentsStats}>
        <Toolbar>
          <FormField label={i.from} className="w-44">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={from}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={i.to} className="w-44">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={to}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            )}
          </FormField>
        </Toolbar>
        {stats && (
          <div className="grid gap-4 xl:grid-cols-2">
            <StatsTable title={i.byReason} rows={stats.byReason} totals={stats.totals} />
            <StatsTable title={i.byZone} rows={stats.byZone} totals={stats.totals} />
          </div>
        )}
      </Section>
    </div>
  );
}

type StatsRow = IncidentStatsView['byReason'][number];

function StatsTable({
  title,
  rows,
  totals,
}: {
  readonly title: string;
  readonly rows: readonly StatsRow[];
  readonly totals: IncidentStatsView['totals'];
}) {
  const columns: Column<StatsRow>[] = [
    { key: 'label', header: title, cell: (r) => r.label },
    { key: 'incidents', header: i.colIncidents, align: 'right', cell: (r) => r.incidents },
    { key: 'reports', header: i.colReports, align: 'right', cell: (r) => r.reports },
    { key: 'downtime', header: i.colDowntime, align: 'right', cell: (r) => r.downtimeMinutes },
    {
      key: 'resolution',
      header: i.colResolution,
      align: 'right',
      cell: (r) => r.avgResolutionMinutes ?? '—',
    },
    { key: 'breached', header: i.colBreached, align: 'right', cell: (r) => r.slaBreached },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      empty={all.ui.common.noResults}
      footer={
        <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
          <TableCell>{totals.label}</TableCell>
          <TableCell className="text-right">{totals.incidents}</TableCell>
          <TableCell className="text-right">{totals.reports}</TableCell>
          <TableCell className="text-right">{totals.downtimeMinutes}</TableCell>
          <TableCell className="text-right">{totals.avgResolutionMinutes ?? '—'}</TableCell>
          <TableCell className="text-right">{totals.slaBreached}</TableCell>
        </TableRow>
      }
    />
  );
}
