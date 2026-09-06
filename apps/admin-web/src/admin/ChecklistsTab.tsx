import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  SaveChecklistCommand,
  type ChecklistDefinitionView,
  type ChecklistItemKind,
  type OrgSnapshot,
} from '@vakhta/contracts';
import { CHECKLIST_ITEM_KINDS, CHECKLIST_LIMITS, defaultChecklistItems } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CameraIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AddDialog } from '@/components/app/add-dialog';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column } from '@/components/app/data-table';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { usePersistentState } from '@/lib/persistent-state';
import { isUnchanged } from '@/lib/forms';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { ApiError, checklistsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const c = t.checklists;
const hints = all.ui.hints;
const ZONE_TYPES = ['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER'] as const;

interface Props {
  readonly org: OrgSnapshot;
}

/** One row of the item editor; `id` keeps React keys stable while rows move. */
interface DraftItem {
  readonly id: number;
  readonly label: string;
  readonly kind: ChecklistItemKind;
}

interface Draft {
  readonly name: string;
  readonly positionIds: readonly string[];
  readonly zoneType: string;
  readonly items: readonly DraftItem[];
  readonly nextId: number;
}

const KIND_ICON: Record<ChecklistItemKind, string> = { CHECK: '▫️', NOTE: '✍️', PHOTO: '📷' };

function emptyDraft(): Draft {
  return {
    name: '',
    positionIds: [],
    zoneType: '',
    items: [
      { id: 1, label: '', kind: 'CHECK' },
      { id: 2, label: '', kind: 'PHOTO' },
    ],
    nextId: 3,
  };
}

function draftOf(row: ChecklistDefinitionView): Draft {
  return {
    name: row.name,
    positionIds: row.positions.map((p) => p.id),
    zoneType: row.zoneType ?? '',
    items: row.items.map((item, index) => ({ id: index + 1, label: item.label, kind: item.kind })),
    nextId: row.items.length + 1,
  };
}

function zoneTypeLabel(zoneType: string | null): string {
  return zoneType
    ? t.directories.zoneTypes[zoneType as (typeof ZONE_TYPES)[number]]
    : c.anyZoneType;
}

/**
 * Checklists of the zone handover (spec 5.6, FR-CLN-03): admins build them here per position and
 * zone type; the bot walks the employee through the items and demands the photos.
 */
export function ChecklistsTab({ org }: Props) {
  const [rows, setRows] = useState<ChecklistDefinitionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const { confirm, dialog } = useConfirm();
  const [openId, setOpenId] = usePersistentState<string | null>('checklists.open', null);
  const [editing, setEditing] = useState<ChecklistDefinitionView | 'new' | null>(null);

  const reload = useCallback(async () => {
    setRows(await checklistsApi.list());
  }, []);

  useEffect(() => {
    reload().catch((e: unknown) => setLoadError(describeError(e)));
  }, [reload]);

  const open = rows?.find((r) => r.id === openId) ?? null;

  async function toggle(row: ChecklistDefinitionView) {
    const isActive = !row.isActive;
    const label = isActive ? c.enable : c.disable;
    const reason = await confirm({
      title: `${label}: ${row.name}`,
      description: hints.checklistsDelete,
      confirmLabel: label,
      commentLabel: t.common.reason,
      destructive: !isActive,
    });
    if (reason === false) return;
    void run(async () => {
      await checklistsApi.setStatus(row.id, { isActive, ...(reason ? { reason } : {}) });
      await reload();
    }, c.statusChanged);
  }

  async function remove(row: ChecklistDefinitionView) {
    const reason = await confirm({
      title: format(c.deleteConfirm, { name: row.name }),
      description: hints.checklistsDelete,
      confirmLabel: c.delete,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (!reason) return;
    void run(async () => {
      try {
        await checklistsApi.delete(row.id, reason);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CHECKLIST_IN_USE') throw new Error(c.inUse);
        throw e;
      }
      if (openId === row.id) setOpenId(null);
      await reload();
    }, c.deleted);
  }

  const columns: Column<ChecklistDefinitionView>[] = [
    { key: 'name', header: t.common.name, cell: (r) => r.name, sortValue: (r) => r.name },
    {
      key: 'positions',
      header: c.positions,
      cell: (r) =>
        r.positions.length > 0 ? (
          r.positions.map((p) => p.name).join(', ')
        ) : (
          <StatusPill tone="warning">{c.anyPosition}</StatusPill>
        ),
      sortValue: (r) => r.positions.map((p) => p.name).join(', '),
    },
    {
      key: 'zoneType',
      header: c.zoneType,
      cell: (r) => (r.zoneType ? zoneTypeLabel(r.zoneType) : <Muted>{c.anyZoneType}</Muted>),
    },
    {
      key: 'items',
      header: c.items,
      cell: (r) =>
        format(c.itemsSummary, {
          items: r.items.length,
          photos: r.items.filter((i) => i.kind === 'PHOTO').length,
        }),
      hideOnCards: false,
    },
    {
      key: 'version',
      header: c.version,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{format(c.versionLabel, { n: r.version })}</span>,
      sortValue: (r) => r.version,
    },
    {
      key: 'status',
      header: c.status,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={r.isActive ? 'success' : 'neutral'}>
            {r.isActive ? c.active : c.inactive}
          </StatusPill>
          {r.handovers > 0 && (
            <StatusPill tone="info">{format(c.usedIn, { n: r.handovers })}</StatusPill>
          )}
        </div>
      ),
      sortValue: (r) => (r.isActive ? 1 : 0),
    },
  ];

  const actions = (row: ChecklistDefinitionView) => [
    {
      key: 'edit',
      label: c.edit,
      icon: PencilIcon,
      disabled: busy,
      onSelect: () => setEditing(row),
    },
    {
      key: 'status',
      label: row.isActive ? c.disable : c.enable,
      icon: PowerIcon,
      disabled: busy,
      destructive: row.isActive,
      separator: true,
      onSelect: () => void toggle(row),
    },
    {
      key: 'delete',
      label: c.delete,
      icon: Trash2Icon,
      disabled: busy,
      destructive: true,
      onSelect: () => void remove(row),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t.tabs.checklists}
        hint={hints.checklists}
        description={c.intro}
        actions={
          <ChecklistDialog
            key="new"
            mode={editing === 'new' ? 'new' : null}
            trigger={c.create}
            org={org}
            onOpen={() => setEditing('new')}
            onClose={() => setEditing(null)}
            onSaved={async (saved) => {
              setEditing(null);
              await reload();
              setOpenId(saved.id);
            }}
          />
        }
      >
        <Feedback error={error ?? loadError} />
      </Section>
      <DataTable
        columns={columns}
        rows={rows ?? []}
        rowKey={(r) => r.id}
        loading={rows === null && !loadError}
        empty={t.common.empty}
        storageKey="checklists"
        searchText={(r) => `${r.name} ${r.positions.map((p) => p.name).join(' ')}`}
        searchPlaceholder={c.search}
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setEditing('new')}>
            {c.create}
          </Button>
        }
        activeKey={openId}
        onRowClick={(r) => setOpenId(r.id)}
        rowActions={actions}
      />
      <DetailSheet
        open={open !== null}
        onOpenChange={(next) => !next && setOpenId(null)}
        title={open?.name ?? ''}
        description={
          open
            ? `${open.positions.map((p) => p.name).join(', ') || c.anyPosition} · ${zoneTypeLabel(open.zoneType)} · ${format(c.versionLabel, { n: open.version })}`
            : undefined
        }
        footer={
          open ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setEditing(open)} disabled={busy}>
                <PencilIcon aria-hidden="true" />
                {c.edit}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void toggle(open)}
                disabled={busy}
              >
                <PowerIcon aria-hidden="true" />
                {open.isActive ? c.disable : c.enable}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void remove(open)}
                disabled={busy}
              >
                <Trash2Icon aria-hidden="true" />
                {c.delete}
              </Button>
            </div>
          ) : undefined
        }
      >
        {open && (
          <>
            <div className="flex flex-wrap gap-1">
              <StatusPill tone={open.isActive ? 'success' : 'neutral'}>
                {open.isActive ? c.active : c.inactive}
              </StatusPill>
              <StatusPill tone="info">{format(c.usedIn, { n: open.handovers })}</StatusPill>
            </div>
            <Muted>
              {formatDateTime(open.validFrom)} ·{' '}
              {format(c.itemsSummary, {
                items: open.items.length,
                photos: open.items.filter((i) => i.kind === 'PHOTO').length,
              })}
            </Muted>
            <BotPreview
              items={open.items.map((i, index) => ({ id: index, label: i.label, kind: i.kind }))}
            />
          </>
        )}
      </DetailSheet>
      {editing !== null && editing !== 'new' && (
        <ChecklistDialog
          key={editing.id}
          mode={editing}
          org={org}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            await reload();
            setOpenId(saved.id);
          }}
        />
      )}
      {dialog}
    </div>
  );
}

/** The checklist as the bot renders it: one line per item with the same marks. */
function BotPreview({ items }: { readonly items: readonly DraftItem[] }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1 font-medium">
        {c.preview}
        <InfoTip text={hints.checklistsItems} />
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span aria-hidden="true">{KIND_ICON[item.kind]}</span>
            <span className={item.label.trim() ? '' : 'text-muted-foreground italic'}>
              {item.label.trim() || c.itemLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ISSUE_TEXT: Record<string, string> = {
  NO_ITEMS: c.noItems,
  NO_PHOTO_ITEM: c.noPhoto,
  EMPTY_LABEL: c.emptyLabel,
};

/**
 * Create / edit dialog. The draft survives a reload (per checklist), editing saves a new version
 * on the server; the preview on the right shows the bot screen the items will produce.
 */
function ChecklistDialog({
  mode,
  org,
  trigger,
  onOpen,
  onClose,
  onSaved,
}: {
  readonly mode: ChecklistDefinitionView | 'new' | null;
  readonly org: OrgSnapshot;
  /** Trigger label of the create dialog; the edit dialog is opened from a row instead. */
  readonly trigger?: string;
  readonly onOpen?: () => void;
  readonly onClose: () => void;
  readonly onSaved: (saved: ChecklistDefinitionView) => Promise<void>;
}) {
  const row = mode === 'new' || mode === null ? null : mode;
  const draftKey = `checklists.draft.${row?.id ?? 'new'}`;
  const [draft, setDraft] = usePersistentState<Draft>(draftKey, () =>
    row ? draftOf(row) : emptyDraft(),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { busy, error, run } = useAction();

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const setItem = (id: number, next: Partial<DraftItem>) =>
    patch({ items: draft.items.map((i) => (i.id === id ? { ...i, ...next } : i)) });
  const addItem = (kind: ChecklistItemKind) =>
    patch({
      items: [...draft.items, { id: draft.nextId, label: '', kind }],
      nextId: draft.nextId + 1,
    });
  const removeItem = (id: number) => patch({ items: draft.items.filter((i) => i.id !== id) });
  const move = (id: number, delta: -1 | 1) => {
    const index = draft.items.findIndex((i) => i.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= draft.items.length) return;
    const items = [...draft.items];
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item!);
    patch({ items });
  };
  const fillDefault = () => {
    const defaults = defaultChecklistItems({
      items: all.handover.items,
      angles: all.handover.angles,
    });
    patch({
      items: defaults.map((item, index) => ({
        id: draft.nextId + index,
        label: item.label,
        kind: item.kind ?? 'CHECK',
      })),
      nextId: draft.nextId + defaults.length,
    });
  };

  const initial = useMemo(() => (row ? draftOf(row) : emptyDraft()), [row]);
  const comparable = (d: Draft) => ({
    name: d.name,
    positionIds: [...d.positionIds].sort(),
    zoneType: d.zoneType,
    items: d.items.map(({ label, kind }) => ({ label, kind })),
  });
  const unchanged = isUnchanged(comparable(draft), comparable(initial));

  const emptyLabels = useMemo(
    () => new Set(draft.items.filter((i) => i.label.trim() === '').map((i) => i.id)),
    [draft.items],
  );

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(SaveChecklistCommand, {
      name: draft.name,
      positionIds: draft.positionIds,
      zoneType: draft.zoneType || null,
      items: draft.items.map((i) => ({ label: i.label, kind: i.kind })),
    });
    const errors: FieldErrors = { ...checked.errors };
    if (errors.items) errors.items = ISSUE_TEXT[errors.items] ?? errors.items;
    if (errors.positionIds) errors.positionIds = c.noPositions;
    if (emptyLabels.size > 0 && !errors.items) errors.items = c.emptyLabel;
    setFieldErrors(errors);
    if (!checked.ok || emptyLabels.size > 0) return;
    void run(
      async () => {
        const saved = row
          ? await checklistsApi.update(row.id, checked.data)
          : await checklistsApi.create(checked.data);
        setDraft(row ? draftOf(saved) : emptyDraft());
        await onSaved(saved);
      },
      row ? c.updated : c.created,
    );
  }

  return (
    <AddDialog
      title={row ? `${c.edit}: ${row.name}` : c.create}
      hint={row ? hints.checklistsVersion : hints.checklists}
      description={c.intro}
      {...(trigger ? { trigger } : {})}
      hideTrigger={!trigger}
      wide
      open={mode !== null}
      onOpenChange={(open) => (open ? onOpen?.() : onClose())}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t.common.name} error={fieldErrors.name} className="sm:col-span-3">
            {(id) => (
              <Input
                id={id}
                value={draft.name}
                maxLength={CHECKLIST_LIMITS.maxNameLength}
                onChange={(ev) => patch({ name: ev.target.value })}
              />
            )}
          </FormField>
          <FormField
            label={c.positions}
            hint={hints.checklistsPosition}
            error={fieldErrors.positionIds}
            className="sm:col-span-3"
          >
            {(id) => (
              <div
                id={id}
                role="group"
                aria-label={c.positions}
                className="flex flex-wrap gap-2 rounded-lg border p-2"
              >
                {org.positions.map((p) => {
                  const checked = draft.positionIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          patch({
                            positionIds: next
                              ? [...draft.positionIds, p.id]
                              : draft.positionIds.filter((x) => x !== p.id),
                          })
                        }
                        aria-label={p.name}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            )}
          </FormField>
          <SelectField
            label={c.zoneType}
            value={draft.zoneType}
            onChange={(v) => patch({ zoneType: v })}
            placeholder={c.anyZoneType}
            options={ZONE_TYPES.map((z) => ({ value: z, label: t.directories.zoneTypes[z] }))}
            hint={hints.checklistsZoneType}
            error={fieldErrors.zoneType}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 text-sm font-medium">
              {c.items}
              <InfoTip text={hints.checklistsItems} />
              <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <CameraIcon className="size-3.5" aria-hidden="true" />
                {c.kindHints.PHOTO}
              </span>
            </div>
            <ol className="flex flex-col gap-2" aria-label={c.items}>
              {draft.items.map((item, index) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="w-6 pt-2 text-right text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      aria-label={`${c.itemLabel} ${index + 1}`}
                      value={item.label}
                      maxLength={CHECKLIST_LIMITS.maxLabelLength}
                      placeholder={c.itemLabel}
                      aria-invalid={
                        fieldErrors.items && emptyLabels.has(item.id) ? true : undefined
                      }
                      onChange={(ev) => setItem(item.id, { label: ev.target.value })}
                    />
                    {fieldErrors.items && emptyLabels.has(item.id) && (
                      <p className="text-xs text-destructive">{c.emptyLabel}</p>
                    )}
                  </div>
                  <NativeSelect
                    aria-label={`${c.kind} ${index + 1}`}
                    value={item.kind}
                    onChange={(ev) =>
                      setItem(item.id, { kind: ev.target.value as ChecklistItemKind })
                    }
                    title={c.kindHints[item.kind]}
                  >
                    {CHECKLIST_ITEM_KINDS.map((kind) => (
                      <NativeSelectOption key={kind} value={kind}>
                        {KIND_ICON[kind]} {c.kinds[kind]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${c.moveUp} ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => move(item.id, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${c.moveDown} ${index + 1}`}
                    disabled={index === draft.items.length - 1}
                    onClick={() => move(item.id, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${c.removeItem} ${index + 1}`}
                    onClick={() => removeItem(item.id)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ol>
            {fieldErrors.items && <p className="text-sm text-destructive">{fieldErrors.items}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addItem('CHECK')}>
                <PlusIcon aria-hidden="true" />
                {c.addItem}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addItem('PHOTO')}>
                <CameraIcon aria-hidden="true" />
                {c.addPhoto}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={fillDefault}>
                <WandSparklesIcon aria-hidden="true" />
                {c.fillDefault}
              </Button>
              <InfoTip text={hints.checklistsPhoto} />
            </div>
          </div>
          <BotPreview items={draft.items} />
        </div>
        <Feedback error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || unchanged}>
            {row ? all.ui.common.save : t.common.add}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}
