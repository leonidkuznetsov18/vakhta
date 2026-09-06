import { useEffect, useMemo, useState } from 'react';
import type { AuditEntryView, DomainEventView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Toolbar } from '@/components/app/page';
import { formatDateTimeSeconds } from '@/lib/format';
import { reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { useRouteSub } from '@/lib/route';
import { usePersistentState } from '@/lib/persistent-state';
import { DetailSheet } from '@/components/app/detail-sheet';

const all = messages(currentLocale());
const a = all.admin.audit;

function Json({ value }: { readonly value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
      {value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Before and after side by side, so a status change reads at a glance. */
function BeforeAfter({ before, after }: { readonly before: unknown; readonly after: unknown }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{a.before}</div>
        <Json value={before} />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{a.after}</div>
        <Json value={after} />
      </div>
    </div>
  );
}

function actionLabel(code: string): string {
  return a.actions[code] ?? code;
}

/** "Audit" (spec 9.1, 13): immutable history of manual actions and the event log with filters. */
export function AuditPage() {
  const [tab, setTab] = useRouteSub<'audit' | 'events'>('audit', ['audit', 'events'], 'audit');
  const [action, setAction] = usePersistentState('audit.action', '');
  const [objectType, setObjectType] = usePersistentState('audit.objectType', '');
  const [type, setType] = usePersistentState('audit.type', '');
  const [audit, setAudit] = useState<AuditEntryView[]>([]);
  const [events, setEvents] = useState<DomainEventView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = usePersistentState<string | null>('audit.open', null);

  const [loading, setLoading] = useState(true);

  // The last 200 entries are loaded per tab; the filters narrow them on the client, so the
  // selects can list exactly the values that occur.
  function load() {
    setError(null);
    setLoading(true);
    const p =
      tab === 'audit'
        ? reportsApi.audit({ limit: 200 }).then(setAudit)
        : reportsApi.events({ limit: 200 }).then(setEvents);
    p.catch((e: unknown) => setError(describeError(e))).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [tab]);

  const actionOptions = useMemo(
    () =>
      [...new Set(audit.map((e) => e.action))]
        .sort()
        .map((v) => ({ value: v, label: actionLabel(v) })),
    [audit],
  );
  const objectOptions = useMemo(
    () => [...new Set(audit.map((e) => e.objectType))].sort().map((v) => ({ value: v, label: v })),
    [audit],
  );
  const typeOptions = useMemo(
    () => [...new Set(events.map((e) => e.type))].sort().map((v) => ({ value: v, label: v })),
    [events],
  );
  const auditRows = useMemo(
    () =>
      audit.filter(
        (e) => (!action || e.action === action) && (!objectType || e.objectType === objectType),
      ),
    [audit, action, objectType],
  );
  const openAudit = auditRows.find((e) => e.id === open) ?? null;
  const openEvent = tab === 'events' ? (events.find((e) => e.id === open) ?? null) : null;

  const eventRows = useMemo(() => events.filter((e) => !type || e.type === type), [events, type]);

  const auditColumns: Column<AuditEntryView>[] = [
    {
      key: 'at',
      header: a.at,
      cell: (e) => <span className="tabular-nums">{formatDateTimeSeconds(e.at)}</span>,
    },
    {
      key: 'actor',
      header: a.actor,
      cell: (e) => (
        <span>
          {e.actorType} <Muted>{e.actorId ?? ''}</Muted>
        </span>
      ),
    },
    {
      key: 'action',
      header: a.action,
      cell: (e) => (
        <span>
          {actionLabel(e.action)}
          {a.actions[e.action] ? <Muted className="ml-1 text-xs">{e.action}</Muted> : null}
        </span>
      ),
    },
    {
      key: 'object',
      header: a.object,
      cell: (e) => (
        <span>
          {e.objectType} <Muted>{e.objectId ?? ''}</Muted>
        </span>
      ),
    },
    {
      key: 'reason',
      header: a.reason,
      cell: (e) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{e.reason ?? '—'}</span>
          {(e.before || e.after) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setOpen(open === e.id ? null : e.id)}
            >
              {a.before}/{a.after}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const eventColumns: Column<DomainEventView>[] = [
    {
      key: 'at',
      header: a.at,
      cell: (e) => <span className="tabular-nums">{formatDateTimeSeconds(e.occurredAt)}</span>,
    },
    {
      key: 'type',
      header: a.type,
      cell: (e) => (
        <span>
          <code className="rounded bg-muted px-1 text-xs">{e.type}</code>
          {e.correctsEventId && (
            <Muted>{` · ${a.corrects} ${e.correctsEventId.slice(0, 8)}`}</Muted>
          )}
        </span>
      ),
    },
    {
      key: 'source',
      header: a.source,
      cell: (e) => (
        <span>
          {e.source} <Muted>{e.actingRole ?? ''}</Muted>
        </span>
      ),
    },
    { key: 'employee', header: a.employee, cell: (e) => e.employeeName ?? '—' },
    {
      key: 'reason',
      header: a.reason,
      cell: (e) => [e.reasonCode, e.comment].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (e) => (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setOpen(open === e.id ? null : e.id)}
        >
          {a.payload}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'audit' | 'events')}>
          <TabsList>
            <TabsTrigger value="audit">{a.tabs.audit}</TabsTrigger>
            <TabsTrigger value="events">{a.tabs.events}</TabsTrigger>
          </TabsList>
        </Tabs>
        <InfoTip text={all.ui.hints.auditTabs} />
      </div>
      <Toolbar>
        {tab === 'audit' ? (
          <>
            <SelectField
              label={a.filterAction}
              value={action}
              onChange={setAction}
              placeholder={a.all}
              options={actionOptions}
              className="w-72"
            />
            <SelectField
              label={a.filterObject}
              value={objectType}
              onChange={setObjectType}
              placeholder={a.all}
              options={objectOptions}
              className="w-56"
            />
          </>
        ) : (
          <SelectField
            label={a.filterType}
            value={type}
            onChange={setType}
            placeholder={a.all}
            options={typeOptions}
            className="w-72"
          />
        )}
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {a.apply}
        </Button>
      </Toolbar>
      <Feedback error={error} />
      {tab === 'audit' ? (
        <DataTable
          columns={auditColumns}
          rows={auditRows}
          loading={loading}
          rowKey={(e) => e.id}
          empty={a.empty}
          storageKey="audit"
          onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
          activeKey={open}
          searchText={(e) => `${e.action} ${e.objectType} ${e.actorId ?? ''} ${e.reason ?? ''}`}
        />
      ) : (
        <DataTable
          columns={eventColumns}
          rows={eventRows}
          loading={loading}
          rowKey={(e) => e.id}
          empty={a.empty}
          storageKey="events"
          onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
          activeKey={open}
          searchText={(e) =>
            `${e.type} ${e.employeeName ?? ''} ${e.reasonCode ?? ''} ${e.comment ?? ''}`
          }
        />
      )}
      {tab === 'audit' && openAudit && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={actionLabel(openAudit.action)}
          description={`${formatDateTimeSeconds(openAudit.at)} · ${openAudit.actorType} ${openAudit.actorId ?? ''}`}
          wide
        >
          {openAudit.reason ? <p className="text-sm">{openAudit.reason}</p> : null}
          <BeforeAfter before={openAudit.before} after={openAudit.after} />
        </DetailSheet>
      )}
      {openEvent && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={openEvent.type}
          description={`${formatDateTimeSeconds(openEvent.occurredAt)} · ${openEvent.source}`}
        >
          <Json value={openEvent.payload} />
        </DetailSheet>
      )}
    </div>
  );
}
