import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { EQUIPMENT_STATES, type EquipmentState } from '@vakhta/domain';
import type { EquipmentRow } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import {
  EmergencyPill,
  EquipmentStatePill,
  OverduePill,
  ReadinessPill,
  formatDayMonth,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { DataTable, type Column } from '@/components/app/data-table';
import { SelectField } from '@/components/app/fields';
import { Section, Toolbar } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/org';

const ALL = '';

function location(row: EquipmentRow): string {
  return row.zoneName ? `${row.unitName} · ${row.zoneName}` : row.unitName;
}

function NextMaintenanceCell({ row }: { readonly row: EquipmentRow }) {
  const t = maintenanceMessages();
  const next = row.nextMaintenance;
  if (!next) return <span className="text-muted-foreground">{t.equipment.noMaintenance}</span>;
  return (
    <span className="flex flex-col leading-tight">
      <span>{next.title}</span>
      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <span className="whitespace-nowrap">{formatDayMonth(next.plannedOn)}</span>
        {next.overdue ? <OverduePill /> : null}
      </span>
    </span>
  );
}

const COLUMNS: readonly Column<EquipmentRow>[] = [
  {
    key: 'machine',
    header: maintenanceMessages().equipment.columns.machine,
    minWidth: '14rem',
    sortValue: (row) => row.code,
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium">
          {row.code} · {row.model ?? row.name}
        </span>
        <span className="text-xs text-muted-foreground">{row.equipmentType ?? row.name}</span>
      </span>
    ),
  },
  {
    key: 'location',
    header: maintenanceMessages().equipment.columns.location,
    sortValue: location,
    cell: location,
  },
  {
    key: 'state',
    header: maintenanceMessages().equipment.columns.state,
    sortValue: (row) => row.state,
    cell: (row) => (
      <span className="flex flex-col items-start gap-1">
        <EquipmentStatePill state={row.state} />
        {row.activeEmergency ? <EmergencyPill number={row.activeEmergency.number} /> : null}
      </span>
    ),
  },
  {
    key: 'next',
    header: maintenanceMessages().equipment.columns.next,
    sortValue: (row) => row.nextMaintenance?.plannedOn ?? '9999',
    cell: (row) => <NextMaintenanceCell row={row} />,
  },
  {
    key: 'materials',
    header: maintenanceMessages().equipment.columns.materials,
    cell: (row) =>
      row.nextMaintenance ? <ReadinessPill readiness={row.nextMaintenance.readiness} /> : '—',
  },
  {
    key: 'mechanic',
    header: maintenanceMessages().equipment.columns.mechanic,
    sortValue: (row) => row.responsible.fullName,
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span>{row.responsible.fullName}</span>
        {row.backup ? (
          <span className="text-xs text-muted-foreground">
            {format(maintenanceMessages().equipment.backup, { name: row.backup.fullName })}
          </span>
        ) : null}
      </span>
    ),
  },
];

function searchText(row: EquipmentRow): string {
  return [
    row.code,
    row.name,
    row.model,
    row.equipmentType,
    row.responsible.fullName,
    row.backup?.fullName,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The machine register (spec 014, US1): filters, the table or cards, and the add action. */
export function EquipmentRegister({
  canManage,
  activeId,
  onOpen,
  onCreate,
}: {
  readonly canManage: boolean;
  readonly activeId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onCreate: () => void;
}) {
  const t = maintenanceMessages();
  const [unitId, setUnitId] = useState(ALL);
  const [state, setState] = useState<EquipmentState | typeof ALL>(ALL);
  const { orgOrEmpty } = useOrg();
  const query = useQuery(
    maintenanceQueries.equipmentList({
      archived: false,
      ...(unitId ? { unitId } : {}),
      ...(state ? { state } : {}),
    }),
  );
  const unitOptions = [
    { value: ALL, label: t.equipment.allUnits },
    ...orgOrEmpty.orgUnits.map((unit) => ({ value: unit.id, label: unit.name })),
  ];
  const stateOptions = [
    { value: ALL, label: t.equipment.allStates },
    ...EQUIPMENT_STATES.map((value) => ({ value, label: t.states[value] })),
  ];
  const filtered = Boolean(unitId || state);
  return (
    <Section
      title={t.equipment.title}
      hint={t.equipment.hint}
      actions={
        canManage ? (
          <Button size="sm" onClick={onCreate}>
            <PlusIcon /> {t.equipment.add}
          </Button>
        ) : null
      }
    >
      <Toolbar>
        <SelectField
          label={t.form.unit}
          value={unitId}
          onChange={setUnitId}
          options={unitOptions}
          className="w-48"
        />
        <SelectField
          label={t.equipment.columns.state}
          value={state}
          onChange={(value) => setState(EQUIPMENT_STATES.find((item) => item === value) ?? ALL)}
          options={stateOptions}
          className="w-44"
        />
      </Toolbar>
      <DataTable
        columns={COLUMNS}
        rows={query.data ?? []}
        rowKey={(row) => row.id}
        empty={filtered ? t.equipment.emptyFiltered : t.equipment.empty}
        queryState={query}
        loading={query.isPending}
        storageKey="maintenance.equipment"
        searchText={searchText}
        searchPlaceholder={t.equipment.search}
        onRowClick={(row) => onOpen(row.id)}
        activeKey={activeId}
        rowLabel={(row) => `${row.code} ${row.name}`}
        resetKey={`${unitId}:${state}`}
      />
    </Section>
  );
}
