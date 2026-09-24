import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { templateDisplayName, templateMinutes } from '@vakhta/domain';
import type { OrgSnapshot, ShiftTemplateView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { useConfirm, type ConfirmOptions } from '@/components/app/confirm-dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { formatDuration } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { readError } from '@/errors';
import {
  PERIOD_BAR,
  PeriodBadge,
  ShiftHours,
  createUnitShift,
  deleteUnitShift,
  shiftTemplateKeys,
  shiftTemplatesQuery,
  updateUnitShift,
} from '@/entities/shift-template';
import { cn } from 'cn';
import {
  NEW_SHIFT,
  draftOf,
  standardShifts,
  takenNames,
  unitShifts,
  type ShiftDraft,
} from '../model/shift-draft';
import { UnitShiftForm } from './unit-shift-form';

const t = messages(currentLocale()).unitShifts;

type Editing =
  | { readonly kind: 'idle' }
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly shift: ShiftTemplateView };

const IDLE: Editing = { kind: 'idle' };

/** The unit's own shifts (spec 013): list, create, edit and delete; standard ones read-only. */
export function UnitShiftsSection({
  unit,
  editable,
}: {
  readonly unit: OrgSnapshot['orgUnits'][number];
  readonly editable: boolean;
}) {
  const templates = useQuery(shiftTemplatesQuery({ siteId: unit.siteId, orgUnitId: unit.id }));
  const [editing, setEditing] = useState<Editing>(IDLE);
  const { save, remove } = useShiftMutations(unit.id, editing, () => setEditing(IDLE));
  const { confirm, dialog } = useConfirm();
  const own = unitShifts(templates.data ?? [], unit.id, currentLocale());
  const creating = editing.kind === 'new';
  const start = (next: Editing) => {
    save.reset();
    setEditing(next);
  };
  async function askDelete(shift: ShiftTemplateView) {
    if ((await confirm(deleteQuestion(shift))) !== false) remove.mutate(shift);
  }
  const form = (saved: ShiftTemplateView | null) => (
    <UnitShiftForm
      initial={saved ? draftOf(saved) : NEW_SHIFT}
      saved={saved ? draftOf(saved) : null}
      usedCount={saved?.usedCount ?? 0}
      taken={takenNames(own, saved?.id ?? null)}
      submitLabel={saved ? t.save : t.create}
      pending={save.isPending}
      error={<Feedback error={readError(save.error)} />}
      onSubmit={(draft) => save.mutate(draft)}
      onCancel={() => start(IDLE)}
    />
  );
  const row = (shift: ShiftTemplateView) =>
    editing.kind === 'edit' && editing.shift.id === shift.id ? (
      <li key={shift.id} className="py-3">
        {form(shift)}
      </li>
    ) : (
      <ShiftRow key={shift.id} shift={shift} revealActions>
        {editable && (
          <OwnShiftActions
            shift={shift}
            busy={save.isPending || remove.isPending}
            deleting={remove.isPending && remove.variables.id === shift.id}
            onEdit={() => start({ kind: 'edit', shift })}
            onDelete={() => void askDelete(shift)}
          />
        )}
      </ShiftRow>
    );
  return (
    <section className="space-y-3" aria-labelledby={`unit-shifts-${unit.id}`}>
      <SectionHeader
        id={`unit-shifts-${unit.id}`}
        canAdd={editable && own.length > 0 && !creating}
        onAdd={() => start({ kind: 'new' })}
      />
      <QueryFeedback query={templates} />
      <Feedback error={readError(remove.error)} />
      {creating && form(null)}
      {templates.isSuccess && own.length === 0 && !creating && (
        <EmptyShifts
          unitName={unit.name}
          editable={editable}
          onCreate={() => start({ kind: 'new' })}
        />
      )}
      <ul className="divide-y">{own.map(row)}</ul>
      <StandardShifts shifts={standardShifts(templates.data ?? [], currentLocale())} />
      {dialog}
    </section>
  );
}

/** Deleting a used shift keeps its planned shifts; the question says how many. */
function deleteQuestion(shift: ShiftTemplateView): ConfirmOptions {
  return {
    title: format(t.deleteTitle, { name: templateDisplayName(shift) }),
    description:
      shift.usedCount > 0 ? format(t.deleteUsed, { count: shift.usedCount }) : t.deleteUnused,
    confirmLabel: t.delete,
    destructive: true,
  };
}

/** Save creates or edits by what is open; both refresh every template list. */
function useShiftMutations(orgUnitId: string, editing: Editing, onSaved: () => void) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: shiftTemplateKeys.all });
  const save = useMutation({
    mutationFn: (draft: ShiftDraft) => {
      const fields = {
        name: draft.name.trim(),
        period: draft.period,
        localStart: draft.localStart,
        localEnd: draft.localEnd,
      };
      return editing.kind === 'edit'
        ? updateUnitShift(editing.shift.id, { ...fields, revision: editing.shift.revision })
        : createUnitShift(orgUnitId, fields);
    },
    retry: false,
    onSuccess: async () => {
      await refresh();
      notifySuccess(editing.kind === 'edit' ? t.saved : t.created);
      onSaved();
    },
  });
  const remove = useMutation({
    mutationFn: (shift: ShiftTemplateView) => deleteUnitShift(shift.id, shift.revision),
    retry: false,
    onSuccess: async () => {
      await refresh();
      notifySuccess(t.deleted);
    },
  });
  return { save, remove };
}

function SectionHeader({ id, canAdd, onAdd }: { id: string; canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 id={id} className="flex items-center gap-1 font-medium">
        {t.sectionTitle}
        <InfoTip text={t.sectionHint} />
      </h3>
      {canAdd && (
        <Button size="sm" onClick={onAdd}>
          <PlusIcon aria-hidden="true" />
          {t.add}
        </Button>
      )}
    </div>
  );
}

function EmptyShifts({
  unitName,
  editable,
  onCreate,
}: {
  unitName: string;
  editable: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4">
      <p className="text-sm">{format(t.empty, { unit: unitName })}</p>
      {editable && (
        <Button onClick={onCreate}>
          <PlusIcon aria-hidden="true" />
          {t.createFirst}
        </Button>
      )}
    </div>
  );
}

function OwnShiftActions({
  shift,
  busy,
  deleting,
  onEdit,
  onDelete,
}: {
  shift: ShiftTemplateView;
  busy: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = templateDisplayName(shift);
  return (
    <>
      <IconButton
        icon={PencilIcon}
        label={format(t.editShift, { name })}
        tooltip={format(t.editShift, { name })}
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={onEdit}
      />
      <IconButton
        icon={Trash2Icon}
        label={format(t.deleteShift, { name })}
        tooltip={format(t.deleteShift, { name })}
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        pending={deleting}
        onClick={onDelete}
      />
    </>
  );
}

function StandardShifts({ shifts }: { shifts: readonly ShiftTemplateView[] }) {
  if (shifts.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-sm py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 transition-transform group-data-[state=open]:rotate-90"
        />
        {t.defaultsTitle}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y">
          {shifts.map((shift) => (
            <ShiftRow key={shift.id} shift={shift}>
              <LockIcon
                role="img"
                aria-label={t.defaultLocked}
                className="size-4 text-muted-foreground"
              />
            </ShiftRow>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ShiftRow({
  shift,
  revealActions = false,
  children,
}: {
  readonly shift: ShiftTemplateView;
  /** Edit and delete appear on hover or focus on wide screens; touch screens always show them. */
  readonly revealActions?: boolean;
  readonly children: ReactNode;
}) {
  // A standard shift is fully described by its hours and type; its seeded name adds nothing.
  const ownName = shift.orgUnitId === null ? '' : shift.name.trim();
  return (
    <li className="group flex items-stretch gap-3 py-2.5">
      <span className={cn('w-1 shrink-0 rounded-full', PERIOD_BAR[shift.period])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <ShiftHours hours={shift} className="block text-base font-semibold" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {ownName && <span className="truncate text-foreground">{ownName}</span>}
          <PeriodBadge period={shift.period} />
          <span>{formatDuration(templateMinutes(shift))}</span>
        </div>
      </div>
      <div
        className={cn(
          'flex items-center gap-1',
          revealActions &&
            'md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100',
        )}
      >
        {children}
      </div>
    </li>
  );
}
