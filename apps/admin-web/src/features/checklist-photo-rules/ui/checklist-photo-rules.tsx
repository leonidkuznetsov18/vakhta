import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChecklistPhotoRulesView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { PlusIcon, SaveIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { readError } from '@/errors';
import { rulesApi, rulesKey } from '../api/rules-api';
import {
  availableSuggestions,
  ruleFields,
  rulesDraftState,
  type RuleField as Field,
} from '../model/rules-draft';
import { RuleField } from './rule-field';

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
        <RulesEditor definitionId={definitionId} zoneId={zoneId} initial={query.data} />
      )}
    </>
  );
}
function RulesEditor({
  definitionId,
  zoneId,
  initial,
}: {
  definitionId: string;
  zoneId: string;
  initial: ChecklistPhotoRulesView;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => ruleFields(initial));
  const client = useQueryClient();
  const { payload, valid, dirty, invalidNames } = rulesDraftState(draft, saved);
  const suggestions = availableSuggestions(draft, t.suggestions);
  const changeField = (
    id: string,
    patch: Partial<Pick<Field, 'value' | 'clarification' | 'exceptions'>>,
  ) =>
    setDraft((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  const removeField = (id: string) =>
    setDraft((current) => current.filter((field) => field.id !== id));
  const addField = (value: string) =>
    setDraft((current) => [...current, ...ruleFields({ items: [value] })]);
  const apply = (view: ChecklistPhotoRulesView) => {
    setSaved(view);
    setDraft(ruleFields(view));
  };
  const mutation = useMutation({
    mutationFn: () =>
      rulesApi.save(definitionId, zoneId, {
        version: saved.version,
        ...payload,
      }),
    retry: false,
    onSuccess: (view) => {
      apply(view);
      client.setQueryData(rulesKey(definitionId, zoneId), view);
    },
  });
  const busy = mutation.isPending;
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
      <p className="text-sm text-muted-foreground">{t.simpleHint}</p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t.quickAdd}</span>
          {suggestions.map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || draft.length >= 30}
              onClick={() => addField(value)}
            >
              <PlusIcon aria-hidden="true" />
              {value}
            </Button>
          ))}
        </div>
      )}
      {draft.map((field, index) => (
        <RuleField
          key={field.id}
          field={field}
          busy={busy}
          invalid={invalidNames[index] ?? false}
          change={changeField}
          remove={removeField}
        />
      ))}
      {!draft.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          {t.invalid}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <IconButton
          size="icon-lg"
          icon={PlusIcon}
          label={t.add}
          tooltip={t.add}
          variant="outline"
          disabled={busy || draft.length >= 30}
          onClick={() => addField('')}
        >
          <span className="sr-only">{t.add}</span>
        </IconButton>
        <IconButton
          size="icon-lg"
          aria-label={t.save}
          className={mutation.isPending && !mutation.isPaused ? '[&>svg]:hidden' : undefined}
          icon={SaveIcon}
          label={t.save}
          tooltip={t.save}
          disabled={busy || !dirty || !valid}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending && !mutation.isPaused ? (
            <LoadingState />
          ) : (
            <span className="sr-only">{t.save}</span>
          )}
        </IconButton>
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
