import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveIcon,
  CircleCheckIcon,
  GaugeIcon,
  PencilIcon,
  SirenIcon,
  TimerIcon,
} from 'lucide-react';
import type { EquipmentDetail } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import {
  EmergencyPill,
  EquipmentStatePill,
  OverduePill,
  formatBusinessDate,
  formatNearDate,
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { StatusPill } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { SheetActions, type SheetAction } from '@/components/app/sheet-actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeError } from '@/errors';
import { useNow } from '@/lib/clock';
import { formatDuration } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { CardDialog, ResponderActionKind, downtimeMinutes, responderAction } from '../model/card';
import { DocumentsTab, HistoryTab, MaterialsTab, PlansTab } from './card-tabs';
import { EmergencyDialog } from './emergency-dialog';
import { ReleaseDialog } from './release-dialog';
import { StateDialog } from './state-dialog';

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{children}</span>
    </div>
  );
}

function orNotSet(value: string | number | null): ReactNode {
  const t = maintenanceMessages();
  if (value === null || value === '')
    return <span className="text-muted-foreground">{t.card.notSet}</span>;
  return value;
}

/** State, open emergency, downtime and restriction, shown in the sheet header. */
function CardMeta({ machine }: { readonly machine: EquipmentDetail }) {
  const t = maintenanceMessages();
  const minutes = downtimeMinutes(machine, useNow());
  return (
    <>
      <EquipmentStatePill state={machine.state} />
      {machine.activeEmergency ? <EmergencyPill number={machine.activeEmergency.number} /> : null}
      {minutes === null ? null : (
        <StatusPill>
          <TimerIcon /> {format(t.card.downtime, { duration: formatDuration(minutes) })}
        </StatusPill>
      )}
      {machine.restriction ? <StatusPill tone="warning">{machine.restriction}</StatusPill> : null}
    </>
  );
}

function Summary({ machine }: { readonly machine: EquipmentDetail }) {
  const t = maintenanceMessages();
  const next = machine.nextMaintenance;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label={t.card.responsible}>{machine.responsible.fullName}</Field>
      <Field label={t.card.backup}>{machine.backup?.fullName ?? orNotSet(null)}</Field>
      <Field label={t.card.criticality}>{t.criticality[machine.criticality]}</Field>
      <Field label={t.card.next}>
        {next ? (
          <span className="flex flex-wrap items-center gap-1">
            {next.title}, {formatNearDate(next.plannedOn)}
            {next.overdue ? <OverduePill /> : null}
          </span>
        ) : (
          t.equipment.noMaintenance
        )}
      </Field>
    </div>
  );
}

function Passport({ machine }: { readonly machine: EquipmentDetail }) {
  const t = maintenanceMessages();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Field label={t.card.manufacturer}>{orNotSet(machine.manufacturer)}</Field>
      <Field label={t.card.model}>{orNotSet(machine.model)}</Field>
      <Field label={t.card.serial}>{orNotSet(machine.serialNumber)}</Field>
      <Field label={t.card.type}>{orNotSet(machine.equipmentType)}</Field>
      <Field label={t.card.year}>{orNotSet(machine.manufacturedYear)}</Field>
      <Field label={t.card.commissioned}>
        {machine.commissionedOn ? formatBusinessDate(machine.commissionedOn) : orNotSet(null)}
      </Field>
      <Field label={t.card.zone}>{orNotSet(machine.zoneName)}</Field>
      <div className="col-span-2 md:col-span-3">
        <Field label={t.card.notes}>
          <span className="whitespace-pre-line">{orNotSet(machine.notes)}</span>
        </Field>
      </div>
    </div>
  );
}

function cardTitle(machine: EquipmentDetail): string {
  return `${machine.code} · ${machine.model ?? machine.name}`;
}

function cardDescription(machine: EquipmentDetail): string {
  return [machine.equipmentType ?? machine.name, machine.unitName, machine.zoneName]
    .filter(Boolean)
    .join(' · ');
}

interface CardProps {
  readonly equipmentId: string;
  readonly canManage: boolean;
  readonly canRespond: boolean;
  readonly onClose: () => void;
  readonly onEdit: (machine: EquipmentDetail) => void;
  readonly onOpenPlan: (input: { equipment: EquipmentDetail; planId: string | null }) => void;
  /** Opens another machine's card, e.g. the target of a copied plan. */
  readonly onOpenEquipment: (equipmentId: string) => void;
}

/** Create an emergency for a running machine, or return a stopped one to service (FR-065). */
function responderActions(
  machine: EquipmentDetail,
  onDialog: (dialog: CardDialog) => void,
): SheetAction[] {
  const t = maintenanceMessages();
  const action = responderAction(machine);
  if (action.kind === ResponderActionKind.CREATE_EMERGENCY)
    return [
      {
        key: 'emergency',
        label: t.card.createEmergency,
        tooltip: t.card.actionHints.createEmergency,
        icon: SirenIcon,
        variant: 'destructive',
        onSelect: () => onDialog(CardDialog.EMERGENCY),
      },
    ];
  if (action.kind === ResponderActionKind.NONE) return [];
  return [
    {
      key: 'release',
      label: t.card.release,
      tooltip: t.card.actionHints.release,
      disabledHint: t.workCard.releaseHint,
      icon: CircleCheckIcon,
      variant: 'success',
      disabled: !action.ready,
      onSelect: () => onDialog(CardDialog.RELEASE),
    },
  ];
}

/** Every action of the card in one row: response first, then state, archive and editing. */
function CardFooter({
  machine,
  canManage,
  canRespond,
  onEdit,
  onDialog,
  onArchived,
}: {
  readonly machine: EquipmentDetail;
  readonly canManage: boolean;
  readonly canRespond: boolean;
  readonly onEdit: () => void;
  readonly onDialog: (dialog: CardDialog) => void;
  readonly onArchived: () => void;
}) {
  const t = maintenanceMessages();
  const client = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const archive = useMutation({
    mutationFn: (reason: string) => maintenanceApi.archiveEquipment(machine.id, reason),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.form.archived);
      onArchived();
    },
  });
  const askArchive = async () => {
    const reason = await confirm({
      title: t.card.archiveTitle,
      description: t.card.archiveHint,
      commentLabel: t.planForm.reasonTitle,
      commentRequired: true,
      destructive: true,
      confirmLabel: t.card.archive,
    });
    if (reason !== false) archive.mutate(reason);
  };
  // A repair in progress owns the state until the machine is released (FR-005).
  const locked = machine.openStop !== null;
  const manage: SheetAction[] = canManage
    ? [
        {
          key: 'state',
          label: t.card.correctState,
          tooltip: t.card.actionHints.correctState,
          disabledHint: t.card.correctStateLocked,
          icon: GaugeIcon,
          disabled: locked,
          onSelect: () => onDialog(CardDialog.STATE),
        },
        {
          key: 'archive',
          label: t.card.archive,
          tooltip: t.card.actionHints.archive,
          icon: ArchiveIcon,
          variant: 'destructive',
          pending: archive.isPending,
          onSelect: () => void askArchive(),
        },
        {
          key: 'edit',
          label: t.card.edit,
          tooltip: t.card.actionHints.edit,
          icon: PencilIcon,
          onSelect: onEdit,
        },
      ]
    : [];
  const respond = canRespond ? responderActions(machine, onDialog) : [];
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <Feedback error={archive.error ? describeError(archive.error) : null} />
      <SheetActions actions={[...respond, ...manage]} />
      {dialog}
    </div>
  );
}

function CardDialogs({
  machine,
  dialog,
  onClose,
}: {
  readonly machine: EquipmentDetail;
  readonly dialog: CardDialog;
  readonly onClose: () => void;
}) {
  switch (dialog) {
    case CardDialog.EMERGENCY:
      return <EmergencyDialog machine={machine} onClose={onClose} />;
    case CardDialog.STATE:
      return <StateDialog machine={machine} onClose={onClose} />;
    case CardDialog.RELEASE:
      return <ReleaseDialog equipmentId={machine.id} onClose={onClose} />;
    case CardDialog.NONE:
      return null;
  }
}

function CardBody({
  machine,
  canManage,
  onOpenPlan,
  onOpenEquipment,
}: {
  readonly machine: EquipmentDetail;
  readonly canManage: boolean;
  readonly onOpenPlan: CardProps['onOpenPlan'];
  readonly onOpenEquipment: CardProps['onOpenEquipment'];
}) {
  const t = maintenanceMessages();
  return (
    <>
      <Summary machine={machine} />
      <Tabs defaultValue="plans">
        <TabsList className="max-md:w-full max-md:overflow-x-auto">
          <TabsTrigger value="passport">{t.card.tabs.passport}</TabsTrigger>
          <TabsTrigger value="documents">{t.card.tabs.documents}</TabsTrigger>
          <TabsTrigger value="plans">{t.card.tabs.plans}</TabsTrigger>
          <TabsTrigger value="materials">{t.card.tabs.materials}</TabsTrigger>
          <TabsTrigger value="history">{t.card.tabs.history}</TabsTrigger>
        </TabsList>
        <TabsContent value="passport" className="mt-3">
          <Passport machine={machine} />
        </TabsContent>
        <TabsContent value="documents" className="mt-3">
          <DocumentsTab machine={machine} canManage={canManage} />
        </TabsContent>
        <TabsContent value="plans" className="mt-3">
          <PlansTab
            machine={machine}
            canManage={canManage}
            onOpenPlan={(planId) => onOpenPlan({ equipment: machine, planId })}
            onOpenEquipment={onOpenEquipment}
          />
        </TabsContent>
        <TabsContent value="materials" className="mt-3">
          <MaterialsTab machine={machine} />
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <HistoryTab history={machine.history} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** The machine card (spec 014, US1–US3): passport, documents, plans, history and responses. */
export function EquipmentCard({
  equipmentId,
  canManage,
  canRespond,
  onClose,
  onEdit,
  onOpenPlan,
  onOpenEquipment,
}: CardProps) {
  const t = maintenanceMessages();
  const [dialog, setDialog] = useState<CardDialog>(CardDialog.NONE);
  const query = useQuery(maintenanceQueries.equipmentDetail(equipmentId));
  const machine = query.data;
  if (!machine)
    return (
      <DetailSheet
        open
        size="wide"
        onOpenChange={(open) => (open ? undefined : onClose())}
        title={t.equipment.title}
      >
        <QueryFeedback query={query} />
      </DetailSheet>
    );
  return (
    <DetailSheet
      open
      size="wide"
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={cardTitle(machine)}
      description={cardDescription(machine)}
      meta={<CardMeta machine={machine} />}
      footer={
        canManage || canRespond ? (
          <CardFooter
            machine={machine}
            canManage={canManage}
            canRespond={canRespond}
            onEdit={() => onEdit(machine)}
            onDialog={setDialog}
            onArchived={onClose}
          />
        ) : undefined
      }
    >
      <QueryFeedback query={query} />
      <CardBody
        machine={machine}
        canManage={canManage}
        onOpenPlan={onOpenPlan}
        onOpenEquipment={onOpenEquipment}
      />
      <CardDialogs machine={machine} dialog={dialog} onClose={() => setDialog(CardDialog.NONE)} />
    </DetailSheet>
  );
}
