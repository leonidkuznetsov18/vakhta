import { useEffect, useState, type FormEvent } from 'react';
import type { AuditEntryView, DomainEventView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Toolbar } from '@/components/app/page';
import { formatDateTimeSeconds } from '@/lib/format';
import { reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { useRouteSub } from '@/lib/route';
import { usePersistentState } from '@/lib/persistent-state';

const all = messages(currentLocale());
const a = all.admin.audit;

function Json({ value }: { readonly value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
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

  function load(ev?: FormEvent) {
    ev?.preventDefault();
    setError(null);
    const p =
      tab === 'audit'
        ? reportsApi
            .audit({
              ...(action ? { action } : {}),
              ...(objectType ? { objectType } : {}),
              limit: 200,
            })
            .then(setAudit)
        : reportsApi.events({ ...(type ? { type } : {}), limit: 200 }).then(setEvents);
    p.catch((e: unknown) => setError(describeError(e)));
  }

  // Reload on tab change; filters apply with the button.
  useEffect(() => {
    setError(null);
    const p =
      tab === 'audit'
        ? reportsApi.audit({ limit: 200 }).then(setAudit)
        : reportsApi.events({ limit: 200 }).then(setEvents);
    p.catch((e: unknown) => setError(describeError(e)));
  }, [tab]);

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
      cell: (e) => <code className="rounded bg-muted px-1 text-xs">{e.action}</code>,
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
      <form onSubmit={load}>
        <Toolbar>
          {tab === 'audit' ? (
            <>
              <FormField label={a.filterAction} className="w-56">
                {(id) => (
                  <Input id={id} value={action} onChange={(e) => setAction(e.target.value)} />
                )}
              </FormField>
              <FormField label={a.filterObject} className="w-56">
                {(id) => (
                  <Input
                    id={id}
                    value={objectType}
                    onChange={(e) => setObjectType(e.target.value)}
                  />
                )}
              </FormField>
            </>
          ) : (
            <FormField label={a.filterType} className="w-56">
              {(id) => <Input id={id} value={type} onChange={(e) => setType(e.target.value)} />}
            </FormField>
          )}
          <Button type="submit" variant="secondary">
            {a.apply}
          </Button>
        </Toolbar>
      </form>
      <Feedback error={error} notice={null} />
      {tab === 'audit' ? (
        <DataTable
          columns={auditColumns}
          rows={audit}
          rowKey={(e) => e.id}
          empty={a.empty}
          storageKey="audit"
          onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
          expanded={(e) =>
            open === e.id ? <Json value={{ before: e.before, after: e.after }} /> : null
          }
        />
      ) : (
        <DataTable
          columns={eventColumns}
          rows={events}
          rowKey={(e) => e.id}
          empty={a.empty}
          storageKey="events"
          onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
          expanded={(e) => (open === e.id ? <Json value={e.payload} /> : null)}
        />
      )}
    </div>
  );
}
