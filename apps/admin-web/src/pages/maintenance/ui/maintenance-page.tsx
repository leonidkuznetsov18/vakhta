import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon, ClipboardListIcon, WrenchIcon } from 'lucide-react';
import type { EquipmentDetail } from '@vakhta/contracts';
import { MAINTENANCE_MANAGERS, MAINTENANCE_RESPONDERS } from '@vakhta/domain';
import { maintenanceMessages, maintenanceQueries } from '@/entities/maintenance';
import { EquipmentCard, ReleaseDialog } from '@/features/equipment-card';
import {
  EquipmentForm,
  EquipmentRegister,
  type EquipmentFormTarget,
} from '@/features/equipment-register';
import { MaintenanceCalendar } from '@/features/maintenance-calendar';
import { PlanEditor } from '@/features/maintenance-plan-editor';
import { WorkQueue, WorkSheet } from '@/features/maintenance-work';
import { HowItWorks } from '@/components/app/how-it-works';
import { StatusPill } from '@/components/app/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { todayIso } from '@/lib/format';
import { useNavigation } from '@/navigation';
import { MaintenanceTab, hasRole, parseTab } from '../model/tabs';

interface PlanTarget {
  readonly equipmentId: string;
  readonly planId: string | null;
}

interface Access {
  readonly canManage: boolean;
  readonly canRespond: boolean;
}

function SectionTabs({
  tab,
  openId,
  canManage,
  onNavigate,
  onCreate,
  onOpenPlan,
}: {
  readonly tab: MaintenanceTab;
  readonly openId: string | null;
  readonly canManage: boolean;
  readonly onNavigate: (tab: MaintenanceTab, id?: string) => void;
  readonly onCreate: () => void;
  readonly onOpenPlan: (target: PlanTarget) => void;
}) {
  const t = maintenanceMessages();
  const summary = useQuery(maintenanceQueries.summary());
  const emergencies = summary.data?.openEmergencies ?? 0;
  return (
    <Tabs value={tab} onValueChange={(value) => onNavigate(parseTab(value))}>
      <TabsList className="max-md:w-full max-md:overflow-x-auto">
        <TabsTrigger value={MaintenanceTab.EQUIPMENT}>
          <WrenchIcon aria-hidden="true" /> {t.tabs.equipment}
        </TabsTrigger>
        <TabsTrigger value={MaintenanceTab.CALENDAR}>
          <CalendarDaysIcon aria-hidden="true" /> {t.tabs.calendar}
        </TabsTrigger>
        <TabsTrigger value={MaintenanceTab.WORK}>
          <ClipboardListIcon aria-hidden="true" /> {t.tabs.work}
          {emergencies ? (
            <StatusPill tone="danger" className="ml-1 h-4 px-1.5 tabular-nums">
              {emergencies}
            </StatusPill>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value={MaintenanceTab.EQUIPMENT} className="mt-4">
        <EquipmentRegister
          canManage={canManage}
          activeId={tab === MaintenanceTab.EQUIPMENT ? openId : null}
          onOpen={(equipmentId) => onNavigate(MaintenanceTab.EQUIPMENT, equipmentId)}
          onCreate={onCreate}
        />
      </TabsContent>
      <TabsContent value={MaintenanceTab.CALENDAR} className="mt-4">
        <MaintenanceCalendar
          today={todayIso()}
          onOpenWork={(workId) => onNavigate(MaintenanceTab.CALENDAR, workId)}
          onOpenPlan={onOpenPlan}
        />
      </TabsContent>
      <TabsContent value={MaintenanceTab.WORK} className="mt-4">
        <WorkQueue
          activeId={tab === MaintenanceTab.WORK ? openId : null}
          onOpen={(workId) => onNavigate(MaintenanceTab.WORK, workId)}
        />
      </TabsContent>
    </Tabs>
  );
}

/** The record the address opens: a machine card on the equipment tab, a work order on the work and calendar tabs. */
function OpenRecord({
  tab,
  openId,
  access,
  onNavigate,
  onEdit,
  onOpenPlan,
  onRelease,
}: {
  readonly tab: MaintenanceTab;
  readonly openId: string;
  readonly access: Access;
  readonly onNavigate: (tab: MaintenanceTab, id?: string) => void;
  readonly onEdit: (detail: EquipmentDetail) => void;
  readonly onOpenPlan: (target: PlanTarget) => void;
  readonly onRelease: (equipmentId: string) => void;
}) {
  if (tab === MaintenanceTab.EQUIPMENT)
    return (
      <EquipmentCard
        key={openId}
        equipmentId={openId}
        {...access}
        onClose={() => onNavigate(MaintenanceTab.EQUIPMENT)}
        onEdit={onEdit}
        onOpenPlan={(target) =>
          onOpenPlan({ equipmentId: target.equipment.id, planId: target.planId })
        }
        onOpenEquipment={(equipmentId) => onNavigate(MaintenanceTab.EQUIPMENT, equipmentId)}
      />
    );
  // The calendar keeps its tab while a work order is open (owner request 2026-09-25).
  return (
    <WorkSheet
      key={openId}
      workId={openId}
      {...access}
      onClose={() => onNavigate(tab)}
      onRelease={onRelease}
    />
  );
}

/**
 * Equipment maintenance (spec 014): the register with machine cards, the maintenance calendar and
 * the work queue. The tab and the open machine or work order live in the address.
 */
export function MaintenancePage({
  tab: rawTab,
  id,
  onNavigate,
}: {
  readonly tab: string | undefined;
  readonly id: string | undefined;
  readonly onNavigate: (tab: MaintenanceTab, id?: string) => void;
}) {
  const tab = parseTab(rawTab);
  const { roles } = useNavigation();
  const access: Access = {
    canManage: hasRole(roles, MAINTENANCE_MANAGERS),
    canRespond: hasRole(roles, MAINTENANCE_RESPONDERS),
  };
  const [form, setForm] = useState<EquipmentFormTarget | null>(null);
  const [plan, setPlan] = useState<PlanTarget | null>(null);
  const [release, setRelease] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="maintenance" />
      <SectionTabs
        tab={tab}
        openId={id ?? null}
        canManage={access.canManage}
        onNavigate={onNavigate}
        onCreate={() => setForm({ kind: 'create' })}
        onOpenPlan={setPlan}
      />
      {/* The plan editor stacks on the card: remounting the card re-ran its enter animation (a flash). */}
      {id ? (
        <OpenRecord
          tab={tab}
          openId={id}
          access={access}
          onNavigate={onNavigate}
          onEdit={(detail) => setForm({ kind: 'edit', detail })}
          onOpenPlan={setPlan}
          onRelease={setRelease}
        />
      ) : null}
      {form ? (
        <EquipmentForm
          target={form}
          onClose={() => setForm(null)}
          onSaved={(equipmentId) => {
            setForm(null);
            onNavigate(MaintenanceTab.EQUIPMENT, equipmentId);
          }}
        />
      ) : null}
      {plan ? (
        <PlanEditor
          key={plan.planId ?? `new:${plan.equipmentId}`}
          equipmentId={plan.equipmentId}
          planId={plan.planId}
          canManage={access.canManage}
          onClose={() => setPlan(null)}
        />
      ) : null}
      {release ? <ReleaseDialog equipmentId={release} onClose={() => setRelease(null)} /> : null}
    </div>
  );
}
