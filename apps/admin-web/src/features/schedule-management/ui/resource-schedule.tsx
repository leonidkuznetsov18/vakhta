import { assignmentAcknowledgement } from '../model/acknowledgement';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResourceCalendar, type CalendarSelection } from '@/shared/ui/resource-calendar';
import { Button } from '@/components/ui/button';
import { Paginator, usePages } from '@/components/app/data-table';
import { calendarModel, type CalendarGrouping } from '../model/calendar';
import { assignmentKey, gridToItems } from '../model/grid';
import { UNASSIGNED_ZONE } from '../model/planning';
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
}: {
  readonly workspace: Workspace;
  readonly dates: readonly string[];
  readonly grouping: CalendarGrouping;
  readonly zoneId: string;
  readonly selectedDate: string;
  readonly onDate: (date: string) => void;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const mobile = useIsMobile();
  const [picked, setPicked] = useState<CalendarSelection | null>(null);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const model = calendarModel({
    ...w,
    dates,
    grouping,
    zoneId,
    locale: currentLocale(),
    publication: w.version
      ? messages(currentLocale()).admin.schedule.statuses[w.version.status]
      : '',
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
  function edit() {
    if (!selectedItem || !w.writable) return;
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
                <p className="text-sm text-muted-foreground">{t.presenceUnknown}</p>
                {w.writable && <Button onClick={edit}>{t.editAssignment}</Button>}
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
