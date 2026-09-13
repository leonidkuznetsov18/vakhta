import { assignmentAcknowledgement } from '../model/acknowledgement';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResourceCalendar, type CalendarSelection } from '@/shared/ui/resource-calendar';
import { Button } from '@/components/ui/button';
import { Paginator, usePages } from '@/components/app/data-table';
import { calendarModel, type CalendarGrouping } from '../model/calendar';
import { assignmentKey, gridFromItems, gridToItems } from '../model/grid';
import type { AdjacentPlan } from '../model/use-adjacent';
import { staffingCoverage } from '../model/use-staffing';
import { reasonText, reasonsFor } from '../model/use-eligibility';
import { UNASSIGNED_ZONE, zoneAllowed } from '../model/planning';
import type { Workspace } from '../model/use-workspace';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
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
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const mobile = useIsMobile();
  const [picked, setPicked] = useState<CalendarSelection | null>(null);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
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
  const model = calendarModel({
    ...w,
    coverage,
    issues: w.issues.reasons,
    grid: adjacent.months.length
      ? gridFromItems([...gridToItems(w.grid), ...gridToItems(adjacent.grid)])
      : w.grid,
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
  });
  const items = gridToItems(w.grid);
  const selectedItem = items.find((item) => assignmentKey(item) === picked?.itemId);
  const acknowledgement = assignmentAcknowledgement({
    assignment: selectedItem,
    recorded: w.recorded,
    version: w.version,
    timezone: w.timezone,
  });
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
  const editable = !!selectedItem && w.writable && zoneAllowed(w.rights.zones, selectedItem.zoneId);
  function edit() {
    if (!selectedItem || !editable) return;
    setEditor({ ...selectedItem, zoneId: selectedItem.zoneId ?? '' });
  }
  return (
    <ResourceCalendar
      model={model}
      layout={mobile ? 'list' : 'grid'}
      selectedDate={selectedDate}
      selection={selection}
      onSelect={select}
      onCreate={create}
      onDate={(date) => {
        onDate(date);
        setPicked(null);
        setEditor(null);
      }}
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
              />
            ) : selectedItem ? (
              <>
                <h3 className="font-semibold break-words">
                  {grouping === 'zones' ? `${employeeLabel(w, selectedItem.employeeId)} · ` : ''}
                  {t.wholeAssignment}
                </h3>
                {grouping === 'people' && (
                  <p className="text-sm [overflow-wrap:anywhere]">{selectedView?.title}</p>
                )}
                <p className="text-sm">{selectedView?.time}</p>
                <p className="text-sm [overflow-wrap:anywhere]">{selectedView?.description}</p>
                <p className="text-sm [overflow-wrap:anywhere]">{selectedView?.status}</p>
                <p className="text-sm">{acknowledgement}</p>
                {reasonsFor(w.issues.reasons, selectedItem.employeeId, selectedItem.businessDate)
                  .length > 0 && (
                  <ul className="space-y-1 text-sm" aria-label={t.conflict}>
                    {reasonsFor(
                      w.issues.reasons,
                      selectedItem.employeeId,
                      selectedItem.businessDate,
                    ).map((reason, index) => (
                      <li
                        key={index}
                        className={
                          reason.severity === 'BLOCK'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-amber-700 dark:text-amber-300'
                        }
                      >
                        {reasonText(reason, {
                          unitName: (id) => w.units.find((unit) => unit.id === id)?.name ?? id,
                          zoneName: (id) => w.zones.find((zone) => zone.id === id)?.name ?? id,
                        })}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-muted-foreground">{t.presenceUnknown}</p>
                {editable && <Button onClick={edit}>{t.editAssignment}</Button>}
                {w.writable && !editable && (
                  <p className="text-sm text-muted-foreground">{t.zoneScope}</p>
                )}
              </>
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
                          className="h-auto min-h-11 w-full whitespace-normal text-left justify-start"
                          onClick={() => select({ ...selection, itemId: item.id })}
                        >
                          {item.title} · {item.time}
                        </Button>
                      </li>
                    ))}
                </ul>
                <Paginator pages={pages} total={selectedCell.items.length} />
              </>
            )}
            {!editor && (
              <Button variant="outline" onClick={() => setPicked(null)}>
                {t.cancel}
              </Button>
            )}
          </div>
        ) : null
      }
    />
  );
}
