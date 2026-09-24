import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlusIcon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import type {
  EquipmentDetail,
  EquipmentDocumentView,
  PlanRow,
  WorkHistoryItem,
} from '@vakhta/contracts';
import { PlanState } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  ReadinessPill,
  formatNearDate,
  formatInterval,
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { EmptyState, StatusPill } from '@/components/app/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describeError } from '@/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { formatSize, lacksManual } from '../model/documents';
import { CopyPlanDialog } from './copy-plan-dialog';
import { UploadDialog } from './upload-dialog';

/** Opens a signed link in a new tab; the tab opens first so the browser does not block it. */
function useOpenDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const tab = window.open('', '_blank');
      try {
        const link = await client.fetchQuery(maintenanceQueries.documentLink(documentId));
        if (tab) {
          tab.opener = null;
          tab.location.href = link.url;
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
  });
}

function DocumentItem({
  doc,
  canManage,
  onOpen,
  onUnlink,
  busy,
}: {
  readonly doc: EquipmentDocumentView;
  readonly canManage: boolean;
  readonly onOpen: () => void;
  readonly onUnlink: () => void;
  readonly busy: boolean;
}) {
  const t = maintenanceMessages();
  const meta = format(t.documents.meta, {
    kind: t.documentKind[doc.kind],
    size: formatSize(doc.sizeBytes),
    author: doc.uploadedBy,
    date: formatDate(doc.linkedAt),
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <span className="flex min-w-0 items-start gap-3">
        <FileTextIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-medium break-words">{doc.title}</span>
          <span className="text-xs text-muted-foreground">
            {[meta, doc.language, doc.edition].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>
          <ExternalLinkIcon /> {t.documents.open}
        </Button>
        {canManage ? (
          <Button size="sm" variant="ghost" pending={busy} onClick={onUnlink}>
            {t.documents.unlink}
          </Button>
        ) : null}
      </span>
    </li>
  );
}

export function DocumentsTab({
  machine,
  canManage,
}: {
  readonly machine: EquipmentDetail;
  readonly canManage: boolean;
}) {
  const t = maintenanceMessages();
  const [uploading, setUploading] = useState(false);
  const client = useQueryClient();
  const open = useOpenDocument();
  const unlink = useMutation({
    mutationFn: (documentId: string) => maintenanceApi.unlinkDocument(machine.id, documentId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.documents.unlinked);
    },
  });
  const failure = open.error ?? unlink.error;
  return (
    <div className="flex flex-col gap-3">
      <Feedback error={failure ? describeError(failure) : null} />
      {machine.documents.length ? (
        <ul className="flex flex-col gap-2">
          {machine.documents.map((doc) => (
            <DocumentItem
              key={doc.id}
              doc={doc}
              canManage={canManage}
              onOpen={() => open.mutate(doc.id)}
              onUnlink={() => unlink.mutate(doc.id)}
              busy={unlink.isPending && unlink.variables === doc.id}
            />
          ))}
        </ul>
      ) : (
        <EmptyState text={t.documents.empty} />
      )}
      {lacksManual(machine.documents) ? (
        <Alert className="border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200">
          <TriangleAlertIcon />
          <AlertTitle>{t.documents.missingManual}</AlertTitle>
          <AlertDescription>{t.documents.missingManualHint}</AlertDescription>
        </Alert>
      ) : null}
      {canManage ? (
        <Button variant="outline" className="self-start" onClick={() => setUploading(true)}>
          <UploadIcon /> {t.documents.upload}
        </Button>
      ) : null}
      {uploading ? (
        <UploadDialog equipmentId={machine.id} onClose={() => setUploading(false)} />
      ) : null}
    </div>
  );
}

const PLAN_COLUMNS: readonly Column<PlanRow>[] = [
  {
    key: 'plan',
    header: maintenanceMessages().plans.columns.plan,
    minWidth: '12rem',
    sortValue: (plan) => plan.title,
    cell: (plan) => (
      <span className="flex flex-col leading-tight">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          {plan.title}
          {plan.state === PlanState.ACTIVE ? null : (
            <StatusPill>{maintenanceMessages().planState[plan.state]}</StatusPill>
          )}
          {plan.hasDraft ? (
            <StatusPill tone="accent">{maintenanceMessages().plans.draft}</StatusPill>
          ) : null}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{plan.sourceLabel}</span>
      </span>
    ),
  },
  {
    key: 'interval',
    header: maintenanceMessages().plans.columns.interval,
    minWidth: '6.5rem',
    cell: (plan) => <span className="whitespace-nowrap">{formatInterval(plan)}</span>,
  },
  {
    key: 'last',
    header: maintenanceMessages().plans.columns.last,
    minWidth: '5.5rem',
    // Plans are read by what comes next; sorting by the last date would only cost width.
    cell: (plan) => <span className="tabular-nums">{formatNearDate(plan.lastPerformedOn)}</span>,
  },
  {
    key: 'next',
    header: maintenanceMessages().plans.columns.next,
    minWidth: '6.5rem',
    sortValue: (plan) => plan.nextDueOn ?? '9999',
    cell: (plan) => <span className="tabular-nums">{formatNearDate(plan.nextDueOn)}</span>,
  },
  {
    key: 'materials',
    header: maintenanceMessages().plans.columns.materials,
    minWidth: '8rem',
    cell: (plan) => (plan.readiness ? <ReadinessPill readiness={plan.readiness} /> : '—'),
  },
];

export function PlansTab({
  machine,
  canManage,
  onOpenPlan,
  onOpenEquipment,
}: {
  readonly machine: EquipmentDetail;
  readonly canManage: boolean;
  readonly onOpenPlan: (planId: string | null) => void;
  readonly onOpenEquipment: (equipmentId: string) => void;
}) {
  const t = maintenanceMessages();
  const [copying, setCopying] = useState<PlanRow | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <Button size="sm" className="self-end" onClick={() => onOpenPlan(null)}>
          <PlusIcon /> {t.plans.add}
        </Button>
      ) : null}
      <DataTable
        columns={PLAN_COLUMNS}
        rows={machine.plans}
        rowKey={(plan) => plan.id}
        empty={t.plans.empty}
        storageKey="maintenance.card.plans"
        onRowClick={(plan) => onOpenPlan(plan.id)}
        rowLabel={(plan) => plan.title}
        {...(canManage
          ? {
              rowActions: (plan: PlanRow) => [
                {
                  key: 'copy',
                  label: t.plans.copy,
                  icon: CopyIcon,
                  onSelect: () => setCopying(plan),
                },
              ],
            }
          : {})}
      />
      {copying ? (
        <CopyPlanDialog
          plan={copying}
          sourceEquipmentId={machine.id}
          onClose={() => setCopying(null)}
          onCopied={(equipmentId) => {
            setCopying(null);
            onOpenEquipment(equipmentId);
          }}
        />
      ) : null}
    </div>
  );
}

function eventLabel(item: WorkHistoryItem): string {
  const events: Readonly<Record<string, string>> = maintenanceMessages().events;
  return events[item.type] ?? item.type;
}

export function HistoryTab({ history }: { readonly history: readonly WorkHistoryItem[] }) {
  const t = maintenanceMessages();
  if (!history.length) return <EmptyState text={t.card.historyEmpty} />;
  return <Timeline items={history.map((item) => ({ ...item, label: eventLabel(item) }))} />;
}

/** A vertical list of dated events, newest first as the server sends them. */
export function Timeline({
  items,
}: {
  readonly items: readonly (WorkHistoryItem & { readonly label: string })[];
}) {
  return (
    <ol className="flex flex-col gap-3 border-l pl-4">
      {items.map((item) => (
        <li key={`${item.at}:${item.type}:${item.actor ?? ''}`} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-foreground/60" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(item.at)}
          </span>
          <div className="break-words">
            {item.label}
            {item.actor ? <span className="text-muted-foreground"> · {item.actor}</span> : null}
          </div>
          {item.comment ? (
            <div className="text-xs whitespace-pre-line break-words text-muted-foreground">
              {item.comment}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
