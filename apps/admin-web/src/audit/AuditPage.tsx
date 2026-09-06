import { useEffect, useMemo, useState } from 'react';
import type { AuditEntryView, DomainEventView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { EyeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CopyButton } from '@/components/app/copy-button';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, StatusPill, Toolbar } from '@/components/app/page';
import { formatDateTimeSeconds } from '@/lib/format';
import { reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { useRouteSub } from '@/lib/route';
import { usePersistentState } from '@/lib/persistent-state';
import { DetailSheet } from '@/components/app/detail-sheet';
import { HowItWorks } from '@/components/app/how-it-works';

const all = messages(currentLocale());
const a = all.admin.audit;

function actorTypeLabel(type: string): string {
  return (a.actorTypes as Record<string, string>)[type] ?? type;
}

/** A value of a before/after record as one readable line. */
function scalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copyable JSON that wraps instead of hiding behind a clipped edge. */
function Json({ value, label }: { readonly value: unknown; readonly label: string }) {
  const text = value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {text && <CopyButton value={text} />}
      </div>
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs break-all whitespace-pre-wrap">
        {text || '—'}
      </pre>
    </div>
  );
}

/**
 * Field by field: every key of before or after in one table, changed rows highlighted, so an
 * administrator sees what the action did without reading two JSON blobs.
 */
function ChangesTable({ before, after }: { readonly before: unknown; readonly after: unknown }) {
  const b = isRecord(before) ? before : {};
  const c = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(c)])];
  if (keys.length === 0) return <Muted>{a.noChanges}</Muted>;
  const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(c[k]));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{a.changes}</span>
        <StatusPill tone={changed.length > 0 ? 'info' : 'neutral'}>
          {format(a.changedFields, { count: changed.length })}
        </StatusPill>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{a.field}</TableHead>
              <TableHead>{a.before}</TableHead>
              <TableHead>{a.after}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => {
              const diff = changed.includes(k);
              return (
                <TableRow key={k} className={diff ? 'bg-amber-50/70 dark:bg-amber-950/30' : ''}>
                  <TableCell className="align-top font-mono text-xs">{k}</TableCell>
                  <TableCell
                    className={`align-top text-xs break-all whitespace-pre-wrap ${diff ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {scalar(b[k])}
                  </TableCell>
                  <TableCell
                    className={`align-top text-xs break-all whitespace-pre-wrap ${diff ? 'font-medium' : ''}`}
                  >
                    {scalar(c[k])}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Label + value + copy, for identifiers people paste into search or a support chat. */
function IdRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

function ActorCell({ entry }: { readonly entry: AuditEntryView }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{entry.actorName ?? actorTypeLabel(entry.actorType)}</span>
      <Muted className="truncate text-xs">
        {entry.actorName ? actorTypeLabel(entry.actorType) : (entry.actorId ?? '')}
      </Muted>
    </span>
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
      sortValue: (e) => e.at,
    },
    { key: 'actor', header: a.actor, cell: (e) => <ActorCell entry={e} /> },
    {
      key: 'action',
      header: a.action,
      cell: (e) => (
        <span className="flex min-w-0 flex-col">
          <span>{actionLabel(e.action)}</span>
          {a.actions[e.action] ? <Muted className="text-xs">{e.action}</Muted> : null}
        </span>
      ),
      sortValue: (e) => actionLabel(e.action),
    },
    {
      key: 'object',
      header: a.object,
      cell: (e) => (
        <span className="flex min-w-0 flex-col">
          <span>{e.objectType}</span>
          {e.objectId && (
            <span className="font-mono text-xs text-muted-foreground" title={e.objectId}>
              {e.objectId.slice(0, 8)}…
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'reason',
      header: a.reason,
      cell: (e) => <span className="line-clamp-2">{e.reason ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      hideOnCards: false,
      cell: (e) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(open === e.id ? null : e.id)}
        >
          <EyeIcon aria-hidden="true" />
          {a.details}
        </Button>
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
          variant="outline"
          size="sm"
          onClick={() => setOpen(open === e.id ? null : e.id)}
        >
          <EyeIcon aria-hidden="true" />
          {a.details}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="audit" />
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
          searchText={(e) =>
            `${actionLabel(e.action)} ${e.action} ${e.objectType} ${e.objectId ?? ''} ${e.actorName ?? ''} ${e.actorId ?? ''} ${e.reason ?? ''}`
          }
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
          description={`${formatDateTimeSeconds(openAudit.at)} · ${openAudit.actorName ?? actorTypeLabel(openAudit.actorType)}`}
          wide
        >
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{a.actor}:</span>
              <span>{openAudit.actorName ?? actorTypeLabel(openAudit.actorType)}</span>
              <Muted>{actorTypeLabel(openAudit.actorType)}</Muted>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{a.object}:</span>
              <span>{openAudit.objectType}</span>
            </div>
            <IdRow label={a.objectId} value={openAudit.objectId} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{a.action}:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{openAudit.action}</code>
            </div>
          </div>
          {openAudit.reason && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{a.reason}</span>
                <CopyButton value={openAudit.reason} />
              </div>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                {openAudit.reason}
              </p>
            </div>
          )}
          <ChangesTable before={openAudit.before} after={openAudit.after} />
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold select-none">
              {a.rawJson}
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <Json value={openAudit.before} label={a.before} />
              <Json value={openAudit.after} label={a.after} />
            </div>
          </details>
        </DetailSheet>
      )}
      {openEvent && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={openEvent.type}
          description={`${formatDateTimeSeconds(openEvent.occurredAt)} · ${openEvent.source}${openEvent.employeeName ? ` · ${openEvent.employeeName}` : ''}`}
          wide
        >
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <IdRow label={a.objectId} value={openEvent.id} />
            {openEvent.correctsEventId && (
              <IdRow label={a.corrects} value={openEvent.correctsEventId} />
            )}
            {(openEvent.reasonCode || openEvent.comment) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{a.reason}:</span>
                <span>{[openEvent.reasonCode, openEvent.comment].filter(Boolean).join(' · ')}</span>
              </div>
            )}
          </div>
          {isRecord(openEvent.payload) && Object.keys(openEvent.payload).length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">{a.field}</TableHead>
                    <TableHead>{a.payload}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(openEvent.payload).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell className="align-top font-mono text-xs">{k}</TableCell>
                      <TableCell className="align-top text-xs break-all whitespace-pre-wrap">
                        {scalar(v)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Json value={openEvent.payload} label={a.rawJson} />
        </DetailSheet>
      )}
    </div>
  );
}
