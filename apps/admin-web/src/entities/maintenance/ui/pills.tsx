import type { ReactNode } from 'react';
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  ClockIcon,
  ListChecksIcon,
  OctagonXIcon,
  PackageIcon,
  PauseIcon,
  PlayIcon,
  SirenIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  XCircleIcon,
} from 'lucide-react';
import type { EquipmentState, MaterialsReadiness, WorkStatus } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { StatusPill, type PillTone } from '@/components/app/page';
import { maintenanceMessages } from '../model/format';

interface PillView {
  readonly tone: PillTone;
  readonly icon: ReactNode;
}

const STATE_VIEW: Readonly<Record<EquipmentState, PillView>> = {
  AVAILABLE: { tone: 'success', icon: <CircleCheckIcon /> },
  RESTRICTED: { tone: 'warning', icon: <TriangleAlertIcon /> },
  STOPPED: { tone: 'danger', icon: <OctagonXIcon /> },
  UNKNOWN: { tone: 'neutral', icon: <CircleHelpIcon /> },
};

const READINESS_VIEW: Readonly<Record<MaterialsReadiness, PillView>> = {
  READY: { tone: 'success', icon: <PackageIcon /> },
  MISSING: { tone: 'accent', icon: <PackageIcon /> },
  UNKNOWN: { tone: 'neutral', icon: <CircleDashedIcon /> },
};

const STATUS_VIEW: Readonly<Record<WorkStatus, PillView>> = {
  ASSIGNED: { tone: 'neutral', icon: <UserCheckIcon /> },
  IN_PROGRESS: { tone: 'info', icon: <PlayIcon /> },
  WAITING: { tone: 'neutral', icon: <PauseIcon /> },
  IN_REVIEW: { tone: 'teal', icon: <ListChecksIcon /> },
  COMPLETED: { tone: 'success', icon: <CircleCheckIcon /> },
  CANCELLED: { tone: 'neutral', icon: <XCircleIcon /> },
};

export function EquipmentStatePill({ state }: { readonly state: EquipmentState }) {
  const view = STATE_VIEW[state];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {maintenanceMessages().states[state]}
    </StatusPill>
  );
}

export function ReadinessPill({ readiness }: { readonly readiness: MaterialsReadiness }) {
  const view = READINESS_VIEW[readiness];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {maintenanceMessages().readiness[readiness]}
    </StatusPill>
  );
}

export function WorkStatusPill({ status }: { readonly status: WorkStatus }) {
  const view = STATUS_VIEW[status];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {maintenanceMessages().workStatus[status]}
    </StatusPill>
  );
}

/** Orange "overdue": the one hue the calendar and the lists keep for late maintenance. */
export function OverduePill() {
  return (
    <StatusPill tone="caution">
      <ClockIcon />
      {maintenanceMessages().equipment.overdue}
    </StatusPill>
  );
}

export function EmergencyPill({ number }: { readonly number: number }) {
  return (
    <StatusPill tone="danger">
      <SirenIcon />
      {format(maintenanceMessages().equipment.emergency, { number })}
    </StatusPill>
  );
}
