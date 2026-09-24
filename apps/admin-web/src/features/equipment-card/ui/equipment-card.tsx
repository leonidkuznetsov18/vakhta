import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, PencilIcon, SirenIcon, TimerIcon } from 'lucide-react';
import type { EquipmentDetail } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import {
  EmergencyPill,
  EquipmentStatePill,
  OverduePill,
  formatBusinessDate,
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { StatusPill } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeError } from '@/errors';
import { useNow } from '@/lib/clock';
import { formatDuration } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { CardDialog, ResponderActionKind, downtimeMinutes, responderAction } from '../model/card';
import { DocumentsTab, HistoryTab, PlansTab } from './card-tabs';
import { EmergencyDialog } from './emergency-dialog';
import { ReleaseDialog } from './release-dialog';

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

function Header({ machine }: { readonly machine: EquipmentDetail }) {
  const t = maintenanceMessages();
  const minutes = downtimeMinutes(machine, useNow());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EquipmentStatePill state={machine.state} />
      {machine.activeEmergency ? <EmergencyPill number={machine.activeEmergency.number} /> : null}
      {minutes === null ? null : (
        <StatusPill>
          <TimerIcon /> {format(t.card.downtime, { duration: formatDuration(minutes) })}
        </StatusPill>
      )}
      {machine.restriction ? <StatusPill tone="warning">{machine.restriction}</StatusPill> : null}
    </div>
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
            {next.title}, {formatBusinessDate(next.plannedOn)}
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
}

function Actions({
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
  const action = responderAction(machine);
  return (
    <>
      <Feedback error={archive.error ? describeError(archive.error) : null} />
      {canRespond && action.kind === ResponderActionKind.CREATE_EMERGENCY ? (
        <Button variant="destructive" onClick={() => onDialog(CardDialog.EMERGENCY)}>
          <SirenIcon /> {t.card.createEmergency}
        </Button>
      ) : null}
      {canRespond && action.kind === ResponderActionKind.RELEASE ? (
        <span className="flex items-center gap-1">
          <Button
            variant="success"
            disabled={!action.ready}
            onClick={() => onDialog(CardDialog.RELEASE)}
          >
            {t.card.release}
          </Button>
          {action.ready ? null : <InfoTip text={t.workCard.releaseHint} />}
        </span>
      ) : null}
      {canManage ? (
        <>
          <Button variant="outline" onClick={onEdit}>
            <PencilIcon /> {t.card.edit}
          </Button>
          <Button variant="ghost" pending={archive.isPending} onClick={() => void askArchive()}>
            <ArchiveIcon /> {t.card.archive}
          </Button>
        </>
      ) : null}
      {dialog}
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
}: CardProps) {
  const t = maintenanceMessages();
  const [dialog, setDialog] = useState<CardDialog>(CardDialog.NONE);
  const query = useQuery(maintenanceQueries.equipmentDetail(equipmentId));
  const machine = query.data;
  return (
    <DetailSheet
      open
      wide
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={machine ? cardTitle(machine) : t.equipment.title}
      description={machine ? cardDescription(machine) : undefined}

      footer={
        machine && (canManage || canRespond) ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Actions
              machine={machine}
              canManage={canManage}
              canRespond={canRespond}
              onEdit={() => onEdit(machine)}
              onDialog={setDialog}
              onArchived={onClose}
            />
          </div>
        ) : undefined
      }
    >
      <QueryFeedback query={query} />
      {machine ? (
        <>
          <Header machine={machine} />
          <Summary machine={machine} />
          <Tabs defaultValue="plans">
            <TabsList className="max-md:w-full max-md:overflow-x-auto">
              <TabsTrigger value="passport">{t.card.tabs.passport}</TabsTrigger>
              <TabsTrigger value="documents">{t.card.tabs.documents}</TabsTrigger>
              <TabsTrigger value="plans">{t.card.tabs.plans}</TabsTrigger>
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
              />
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <HistoryTab history={machine.history} />
            </TabsContent>
          </Tabs>
          {dialog === CardDialog.EMERGENCY ? (
            <EmergencyDialog machine={machine} onClose={() => setDialog(CardDialog.NONE)} />
          ) : null}
          {dialog === CardDialog.RELEASE ? (
            <ReleaseDialog equipmentId={machine.id} onClose={() => setDialog(CardDialog.NONE)} />
          ) : null}
        </>
      ) : null}
    </DetailSheet>
  );
}
