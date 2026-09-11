import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProhibitedPhotoItems, type ChecklistPhotoRulesView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { PlusIcon, Trash2Icon, SaveIcon, RefreshCwIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { readError } from '@/errors';
import { rulesApi, rulesKey } from '../api/rules-api';

const t = messages(currentLocale()).checklistPhotoRules;
interface Zone {
  id: string;
  name: string;
}
export function ChecklistPhotoRules({
  definitionId,
  zones,
}: {
  definitionId: string;
  zones: readonly Zone[];
}) {
  const [selected, setSelected] = useState('');
  const zoneId = zones.length === 1 ? (zones[0]?.id ?? '') : selected;
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {t.title}
        <InfoTip text={t.hint} />
      </h3>
      <p className="text-sm text-muted-foreground">{t.hint}</p>
      <label className="flex flex-col gap-2 text-sm">
        {t.zone}
        <NativeSelect
          value={zoneId}
          onChange={(e) => setSelected(e.target.value)}
          disabled={zones.length === 1}
        >
          <NativeSelectOption value="">{t.choose}</NativeSelectOption>
          {zones.map((zone) => (
            <NativeSelectOption key={zone.id} value={zone.id}>
              {zone.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      {zoneId && (
        <RulesQuery key={`${definitionId}:${zoneId}`} definitionId={definitionId} zoneId={zoneId} />
      )}
    </section>
  );
}
function RulesQuery({ definitionId, zoneId }: { definitionId: string; zoneId: string }) {
  const query = useQuery({
    queryKey: rulesKey(definitionId, zoneId),
    queryFn: ({ signal }) => rulesApi.get(definitionId, zoneId, signal),
  });
  return (
    <>
      <QueryFeedback query={query} />
      {query.data && (
        <RulesEditor
          definitionId={definitionId}
          zoneId={zoneId}
          initial={query.data}
          reload={async () => (await query.refetch()).data}
        />
      )}
    </>
  );
}
const fields = (items: readonly string[]) =>
  items.map((value) => ({ id: crypto.randomUUID(), value }));
function RulesEditor({
  definitionId,
  zoneId,
  initial,
  reload,
}: {
  definitionId: string;
  zoneId: string;
  initial: ChecklistPhotoRulesView;
  reload: () => Promise<ChecklistPhotoRulesView | undefined>;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => fields(initial.items));
  const [reloading, setReloading] = useState(false);
  const client = useQueryClient();
  const parsed = ProhibitedPhotoItems.safeParse(draft.map((field) => field.value));
  const dirty =
    JSON.stringify(draft.map((field) => field.value.trim())) !== JSON.stringify(saved.items);
  const apply = (view: ChecklistPhotoRulesView) => {
    setSaved(view);
    setDraft(fields(view.items));
  };
  const mutation = useMutation({
    mutationFn: () =>
      rulesApi.save(definitionId, zoneId, {
        version: saved.version,
        items: draft.map((field) => field.value),
      }),
    retry: false,
    onSuccess: (view) => {
      apply(view);
      client.setQueryData(rulesKey(definitionId, zoneId), view);
    },
  });
  const busy = mutation.isPending || reloading;
  if (!initial.canEdit)
    return (
      <ul className="text-sm">
        {saved.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {!saved.items.length && <li>{t.empty}</li>}
      </ul>
    );
  return (
    <div className="flex flex-col gap-3">
      {draft.map((field) => (
        <div key={field.id} className="flex items-end gap-2">
          <label htmlFor={field.id} className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              {t.item}
              <InfoTip text={t.invalid} />
            </span>
            <Input
              id={field.id}
              value={field.value}
              maxLength={100}
              disabled={busy}
              aria-invalid={!parsed.success}
              onChange={(e) =>
                setDraft(
                  draft.map((item) =>
                    item.id === field.id ? { ...item, value: e.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <IconButton
            icon={Trash2Icon}
            label={t.remove}
            tooltip={t.remove}
            variant="outline"
            disabled={busy}
            onClick={() => setDraft(draft.filter((item) => item.id !== field.id))}
          />
        </div>
      ))}
      {!draft.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
      {!parsed.success && (
        <p role="alert" className="text-sm text-destructive">
          {t.invalid}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <IconButton
          icon={PlusIcon}
          label={t.add}
          tooltip={t.add}
          variant="outline"
          disabled={busy || draft.length >= 30}
          onClick={() => setDraft([...draft, ...fields([''])])}
        />
        <IconButton
          icon={SaveIcon}
          label={t.save}
          tooltip={t.hint}
          disabled={busy || !dirty || !parsed.success}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending && !mutation.isPaused ? <LoadingState label={t.save} /> : t.save}
        </IconButton>
        <IconButton
          icon={RefreshCwIcon}
          label={t.reload}
          tooltip={t.reload}
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (dirty && !window.confirm(t.discard)) return;
            setReloading(true);
            try {
              const view = await reload();
              if (view) apply(view);
            } finally {
              setReloading(false);
            }
          }}
        />
      </div>
      {mutation.isPaused && (
        <p role="status">{messages(currentLocale()).ui.common.waitingConnection}</p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiError && mutation.error.code === 'INSPECTION_CONFLICT'
            ? t.conflict
            : readError(mutation.error)}
        </p>
      )}
      {mutation.isSuccess && !dirty && (
        <p role="status" className="text-sm">
          {t.saved}
        </p>
      )}
    </div>
  );
}
