import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  PlusIcon,
  TriangleAlertIcon,
  Unlink2Icon,
} from 'lucide-react';
import type {
  EquipmentDetail,
  EquipmentDocumentView,
  EquipmentMaterialView,
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
import { describeError } from '@/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { formatSize, lacksManual } from '../model/documents';
import { CopyPlanDialog } from './copy-plan-dialog';
import { UploadDialog } from './upload-dialog';
import { RichText } from '@/shared/ui/rich-text';
import { IconButton } from '@/shared/ui/icon-button';

/**
 * Opens a document in a new tab. A link document goes straight to its address; a stored file
 * needs a signed link first, so its tab opens before the request and the browser does not block it.
 */
function useOpenDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (doc: EquipmentDocumentView) => {
      if (!doc.hasFile && doc.sourceUrl) {
        window.open(doc.sourceUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const tab = window.open('', '_blank');
      try {
        const link = await client.fetchQuery(maintenanceQueries.documentLink(doc.id));
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

function documentMeta(doc: EquipmentDocumentView): string {
  const t = maintenanceMessages();
  const shared = {
    kind: t.documentKind[doc.kind],
    author: doc.uploadedBy,
    date: formatDate(doc.linkedAt),
  };
  return doc.sizeBytes === null
    ? format(t.documents.metaLink, shared)
    : format(t.documents.meta, { ...shared, size: formatSize(doc.sizeBytes) });
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
  const meta = documentMeta(doc);
  const Icon = doc.hasFile ? FileTextIcon : LinkIcon;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <span className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-medium break-words">{doc.title}</span>
          <span className="text-xs text-muted-foreground">
            {[meta, doc.language, doc.edition].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      <span className="flex gap-2">
        <IconButton
          icon={ExternalLinkIcon}
          label={t.documents.open}
          tooltip={t.documents.openHint}
          size="sm"
          variant="outline"
          onClick={onOpen}
        />
        {canManage ? (
          <IconButton
            icon={Unlink2Icon}
            label={t.documents.unlink}
            tooltip={t.documents.unlinkHint}
            size="sm"
            variant="ghost"
            pending={busy}
            onClick={onUnlink}
          />
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
              onOpen={() => open.mutate(doc)}
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
        <IconButton
          icon={PlusIcon}
          label={t.documents.add}
          tooltip={t.documents.addHint}
          variant="outline"
          className="self-start"
          onClick={() => setUploading(true)}
        />
      ) : null}
      {uploading ? (
        <UploadDialog equipmentId={machine.id} onClose={() => setUploading(false)} />
      ) : null}
    </div>
  );
}

const MATERIAL_COLUMNS: readonly Column<EquipmentMaterialView>[] = [
  {
    key: 'item',
    header: maintenanceMessages().card.materialsTab.columns.item,
    minWidth: '12rem',
    sortValue: (row) => row.name,
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{row.name}</span>
        {row.article ? <span className="text-xs text-muted-foreground">{row.article}</span> : null}
      </span>
    ),
  },
  {
    key: 'kind',
    header: maintenanceMessages().card.materialsTab.columns.kind,
    minWidth: '6rem',
    sortValue: (row) => row.kind,
    cell: (row) => maintenanceMessages().materialKind[row.kind],
  },
  {
    key: 'quantity',
    header: maintenanceMessages().card.materialsTab.columns.quantity,
    minWidth: '6rem',
    align: 'right',
    cell: (row) => (
      <span className="tabular-nums whitespace-nowrap">
        {row.quantity} {row.unit}
      </span>
    ),
  },
  {
    key: 'mode',
    header: maintenanceMessages().card.materialsTab.columns.mode,
    minWidth: '7rem',
    cell: (row) => maintenanceMessages().materialMode[row.mode],
  },
  {
    key: 'plan',
    header: maintenanceMessages().card.materialsTab.columns.plan,
    minWidth: '10rem',
    sortValue: (row) => row.nextDueOn ?? '9999',
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span>{row.planTitle}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatNearDate(row.nextDueOn)}
          {row.planState === PlanState.ACTIVE
            ? ''
            : ` · ${maintenanceMessages().planState[row.planState]}`}
        </span>
      </span>
    ),
  },
];

/** What the published plans need, so the stock question is answered from one list. */
/** Materials belong to their plans: a row opens the plan that lists it (owner request 2026-09-25). */
export function MaterialsTab({
  machine,
  onOpenPlan,
}: {
  readonly machine: EquipmentDetail;
  readonly onOpenPlan: (planId: string) => void;
}) {
  const t = maintenanceMessages();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.card.materialsTab.hint}</p>
      <DataTable
        columns={MATERIAL_COLUMNS}
        rows={machine.materials}
        rowKey={(row) => `${row.planId}:${row.name}:${row.article ?? ''}`}
        empty={t.card.materialsTab.empty}
        primaryKey="item"
        onRowClick={(row) => onOpenPlan(row.planId)}
      />
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
        <IconButton
          icon={PlusIcon}
          label={t.plans.add}
          tooltip={t.plans.addHint}
          size="sm"
          className="self-end"
          onClick={() => onOpenPlan(null)}
        />
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
            <RichText text={item.comment} className="text-xs text-muted-foreground" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
