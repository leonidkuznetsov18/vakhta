import { EmployeeProfileLink } from '@/entities/employee';
import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ResourceCalendar,
  selectableRow,
  type CalendarSelection,
  type CalendarEmphasis,
} from '@/shared/ui/resource-calendar';
import { Button } from '@/components/ui/button';
import { TableSearch } from '@/shared/ui/table-search';
import { Paginator, RowMenu, usePages } from '@/components/app/data-table';
import { calendarModel, type CalendarGrouping } from '../model/calendar';
import {
  assignmentKey,
  gridFromItems,
  gridToItems,
  removeRow,
  removeZoneAssignments,
} from '../model/grid';
import type { AdjacentPlan } from '../model/use-adjacent';
import { staffingCoverage } from '../model/use-staffing';
import {
  assignmentAbilities,
  checkedMove,
  removeAssignment,
  revertAssignment,
} from '../model/assignment-actions';
import { Feedback } from '@/components/app/feedback';
import { UNASSIGNED_ZONE } from '../model/planning';
import type { Workspace } from '../model/use-workspace';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
import { AssignmentDetails } from './assignment-details';
import { NotesSection } from './notes-section';
import { SlotDetails } from './slot-details';
import { useOperations } from '../model/use-operations';
import { useCalendarEvents } from '../model/use-events';
import { useNotes } from '../model/use-notes';
import { useRemoveAssignment } from './use-remove-assignment';
import type { OpenSlots } from '../model/use-open-slots';
import { employeeLabel } from './assignment-changes';

export function ResourceSchedule({
  workspace: w,
  dates,
  grouping,
  zoneId,
  selectedDate,
  onDate,
  today,
  adjacent,
  slots,
  emphasis = null,
  reveal = null,
}: {
  readonly workspace: Workspace;
  readonly dates: readonly string[];
  readonly grouping: CalendarGrouping;
  readonly zoneId: string;
  readonly selectedDate: string;
  readonly onDate: (date: string) => void;
  readonly today: string;
  /** Neighbouring months touched by the visible week; displayed, never written. */
  readonly adjacent: AdjacentPlan;
  readonly slots: OpenSlots;
  readonly emphasis?: CalendarEmphasis | null;
  /** A shift the caller wants opened (from the issue list); a new object per request. */
  readonly reveal?: CalendarSelection | null;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const mobile = useIsMobile();
  const operations = useOperations({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    dates,
    enabled: !!w.version,
  });
  const events = useCalendarEvents({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    dates,
    enabled: !!w.version,
  });
  const notes = useNotes({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    month: w.month,
    enabled: !!w.version,
  });
  const quickRemove = useRemoveAssignment(w);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CalendarSelection | null>(reveal);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const [revealed, setRevealed] = useState(reveal);
  if (reveal !== revealed) {
    setRevealed(reveal);
    if (reveal) {
      setPicked(reveal);
      setEditor(null);
    }
  }
  const [moveError, setMoveError] = useState<string | null>(null);
  const displayGrid = adjacent.months.length
    ? gridFromItems([...gridToItems(w.grid), ...gridToItems(adjacent.grid)])
    : w.grid;
  const coverage = staffingCoverage({
    staffing: w.staffing,
    grid: displayGrid,
    templates: w.templates,
    timezone: w.timezone,
    dates,
    zoneIds: w.zones.map((zone) => zone.id),
  });
  const fullModel = calendarModel({
    ...w,
    coverage,
    issues: w.issues.reasons,
    grid: displayGrid,
    published: adjacent.months.length
      ? gridFromItems([...gridToItems(w.publicationBaseline), ...gridToItems(adjacent.published)])
      : w.publicationBaseline,
    recorded: adjacent.months.length ? [...w.recorded, ...adjacent.recorded] : w.recorded,
    dates,
    grouping,
    zoneId,
    locale: currentLocale(),
    today,
    editableMonth: w.month,
    allowedZones: w.rights.zones,
    slots: slots.slots,
    ...(operations.data ? { operations: operations.data } : {}),
    ...(w.context ? { absences: w.context.absences } : {}),
    ...(events.data ? { events: events.data } : {}),
  });
  // The worker search narrows the rows of the people grouping, like the month matrix does.
  const needle = search.trim().toLocaleLowerCase();
  const model =
    grouping === 'people' && needle
      ? {
          ...fullModel,
          resources: fullModel.resources.filter((row) =>
            row.title.toLocaleLowerCase().includes(needle),
          ),
        }
      : fullModel;
  const items = gridToItems(w.grid);
  const itemByKey = new Map(items.map((item) => [assignmentKey(item), item]));
  const shiftsByEmployee = new Map<string, number>();
  for (const item of items) {
    if (zoneId && item.zoneId !== zoneId) continue;
    shiftsByEmployee.set(item.employeeId, (shiftsByEmployee.get(item.employeeId) ?? 0) + 1);
  }
  const employees = new Map(w.employees.map((employee) => [employee.id, employee]));
  const selectedItem = picked?.itemId ? itemByKey.get(picked.itemId) : undefined;
  const abilities = selectedItem ? assignmentAbilities(w, selectedItem) : null;
  const selectedSlot = picked?.itemId?.startsWith('slot:')
    ? slots.slots.find((slot) => `slot:${slot.id}` === picked.itemId)
    : undefined;
  const selection =
    selectedItem && picked
      ? {
          ...picked,
          resourceId:
            grouping === 'people'
              ? selectedItem.employeeId
              : (selectedItem.zoneId ?? UNASSIGNED_ZONE),
        }
      : picked;
  const selectedCell = model.resources
    .find((resource) => resource.id === selection?.resourceId)
    ?.cells.find((cell) => cell.date === selection?.date);
  const selectedView = selectedCell?.items.find((item) => item.id === selection?.itemId);
  const pages = usePages(
    selectedCell?.items.length ?? 0,
    10,
    undefined,
    -1,
    `${selection?.resourceId}:${selection?.date}`,
  );
  function select(value: CalendarSelection) {
    setPicked(value);
    setEditor(null);
    onDate(value.date);
  }
  function create(value: CalendarSelection) {
    const availability = model.resources
      .find((resource) => resource.id === value.resourceId)
      ?.cells.find((cell) => cell.date === value.date)?.create;
    if (!w.writable || !availability || availability.disabledReason) return;
    setPicked(value);
    onDate(value.date);
    setEditor({
      employeeId: grouping === 'people' ? value.resourceId : '',
      businessDate: value.date,
      zoneId:
        grouping === 'zones' && value.resourceId !== UNASSIGNED_ZONE ? value.resourceId : zoneId,
    });
  }
  function removeSelected() {
    if (!selectedItem || !abilities?.removable) return;
    w.edit(removeAssignment(w.grid, selectedItem));
    setPicked(null);
  }
  function edit(move: boolean) {
    if (!selectedItem || !abilities?.editable) return;
    setEditor({ ...selectedItem, zoneId: selectedItem.zoneId ?? '', move });
  }
  function revertSelected() {
    if (!selectedItem || !abilities?.editable || !abilities.locallyChanged) return;
    w.edit(revertAssignment(w.grid, selectedItem, abilities.saved));
    setPicked(null);
  }
  function move(
    from: CalendarSelection & { itemId: string },
    to: { resourceId: string; date: string },
  ) {
    const item = itemByKey.get(from.itemId);
    if (!item) return;
    const target =
      grouping === 'people'
        ? { employeeId: to.resourceId, businessDate: to.date }
        : {
            businessDate: to.date,
            zoneId: to.resourceId === UNASSIGNED_ZONE ? null : to.resourceId,
          };
    const result = checkedMove({ workspace: w, item, target, t });
    if ('error' in result) {
      if (result.error) setMoveError(result.error);
      return;
    }
    setMoveError(null);
    setPicked(null);
    w.edit(result.grid);
  }
  function quickRemoveItem(from: CalendarSelection & { itemId: string }) {
    const item = itemByKey.get(from.itemId);
    if (!item) return;
    void quickRemove.remove(item, () => {
      if (picked?.itemId === from.itemId) setPicked(null);
    });
  }
  function removeWorker(employeeId: string) {
    if (!w.writable) return;
    w.edit(
      zoneId ? removeZoneAssignments(w.grid, employeeId, zoneId) : removeRow(w.grid, employeeId),
    );
    if (selectedItem?.employeeId === employeeId) setPicked(null);
  }
  return (
    <>
      <Feedback error={moveError} />
      {grouping === 'people' && (
        <TableSearch value={search} onChange={setSearch} label={t.workerSearch} />
      )}
      <ResourceCalendar
        model={model}
        {...(grouping === 'people'
          ? {
              renderResourceTitle: (row: { readonly id: string; readonly title: string }) => (
                <span className="flex items-start justify-between gap-1">
                  <EmployeeProfileLink
                    id={row.id}
                    name={row.title}
                    avatarVersion={employees.get(row.id)?.avatarVersion}
                  />
                  {w.writable && (
                    <RowMenu
                      label={`${zoneId ? t.removeZoneAssignments : t.removeWorker}: ${employeeLabel(w, row.id)}`}
                      actions={[
                        {
                          key: 'remove',
                          label: zoneId ? t.removeZoneAssignments : t.removeWorker,
                          icon: Trash2Icon,
                          destructive: true,
                          disabled: !shiftsByEmployee.get(row.id),
                          onSelect: () => removeWorker(row.id),
                        },
                      ]}
                    />
                  )}
                </span>
              ),
            }
          : {})}
        layout={mobile ? 'list' : 'grid'}
        selectedDate={selectedDate}
        detailRequest={reveal}
        selection={selection}
        onSelect={select}
        onClearSelection={() => {
          setPicked(null);
          setEditor(null);
        }}
        onCreate={create}
        onDate={(date) => {
          onDate(date);
          setPicked(null);
          setEditor(null);
        }}
        emphasis={emphasis}
        {...(w.writable ? { onMove: move, onRemove: quickRemoveItem } : {})}
        detail={
          selection && selectedCell ? (
            <div className="space-y-3">
              {editor && w.writable ? (
                <AssignmentEditor
                  key={`${editor.employeeId}:${editor.businessDate}`}
                  workspace={w}
                  context={editor}
                  onClose={() => setEditor(null)}
                  onApplied={() => {
                    setEditor(null);
                    setPicked(null);
                  }}
                  onCreateSlot={(input) =>
                    slots.create.mutate(
                      {
                        siteId: w.siteId,
                        orgUnitId: w.orgUnitId,
                        periodMonth: w.month,
                        ...input,
                      },
                      { onSuccess: () => setEditor(null) },
                    )
                  }
                  creatingSlot={slots.create.isPending}
                />
              ) : selectedSlot ? (
                <SlotDetails
                  workspace={w}
                  slot={selectedSlot}
                  slots={slots}
                  onDone={() => setPicked(null)}
                />
              ) : selectedItem && abilities ? (
                <AssignmentDetails
                  workspace={w}
                  item={selectedItem}
                  view={selectedView}
                  abilities={abilities}
                  grouping={grouping}
                  events={events}
                  operations={operations}
                  notes={notes}
                  onEdit={edit}
                  onRevert={revertSelected}
                  onRemove={removeSelected}
                />
              ) : (
                <>
                  <h3 className="font-semibold">
                    {t.allItems} · {selection.date}
                  </h3>
                  <ul className="divide-y">
                    {selectedCell.items
                      .slice((pages.page - 1) * pages.size, pages.page * pages.size)
                      .map((item) => (
                        <li key={item.id} className="py-2">
                          <Button
                            variant="ghost"
                            className={`h-auto min-h-11 w-full justify-start whitespace-normal text-left ${selectableRow}`}
                            onClick={() => select({ ...selection, itemId: item.id })}
                          >
                            {item.title} · {item.time}
                          </Button>
                        </li>
                      ))}
                  </ul>
                  <Paginator pages={pages} total={selectedCell.items.length} />
                  {selection.date.startsWith(w.month) && (
                    <NotesSection
                      workspace={w}
                      notes={notes}
                      date={selection.date}
                      zoneId={
                        grouping === 'zones' && selection.resourceId !== UNASSIGNED_ZONE
                          ? selection.resourceId
                          : null
                      }
                      employeeId={grouping === 'people' ? selection.resourceId : null}
                    />
                  )}
                </>
              )}
            </div>
          ) : null
        }
      />
      {quickRemove.dialog}
    </>
  );
}
