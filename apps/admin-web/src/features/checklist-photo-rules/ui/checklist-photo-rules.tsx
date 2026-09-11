import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChecklistPhotoRulesView, type PhotoObjectView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { PlusIcon, SaveIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { readError } from '@/errors';
import { photoObjectsKey, rulesApi, rulesKey } from '../api/rules-api';
import { registerUnsaved } from '@/lib/unsaved';
import { catalogChoices, rulesDraft, rulesDraftState, toggleRule } from '../model/rules-draft';
import { RuleField } from './rule-field';

const t = messages(currentLocale()).checklistPhotoRules;
/**
 * Attached only while the draft differs from what is saved: collapsing the row, switching sections
 * or closing the tab then asks first. Detaching (a save or a revert) withdraws the question.
 */
const guardUnsaved = (element: HTMLDivElement | null) =>
  element ? registerUnsaved(() => true, t.discard) : undefined;
/** One object list per checklist; it is shown as saved the moment the checklist is expanded. */
export function ChecklistPhotoRules({ definitionId }: { definitionId: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {t.title}
        <InfoTip text={t.hint} />
      </h3>
      <RulesQuery definitionId={definitionId} />
    </section>
  );
}
function RulesQuery({ definitionId }: { definitionId: string }) {
  const query = useQuery({
    queryKey: rulesKey(definitionId),
    queryFn: ({ signal }) => rulesApi.get(definitionId, signal),
  });
  const objects = useQuery({
    queryKey: photoObjectsKey,
    queryFn: ({ signal }) => rulesApi.objects(signal),
  });
  return (
    <>
      <QueryFeedback query={query} />
      <QueryFeedback query={objects} />
      {query.data && objects.data && (
        <RulesEditor
          definitionId={definitionId}
          initial={query.data}
          objects={objects.data.objects}
          canCreate={objects.data.canEdit}
        />
      )}
    </>
  );
}
function RulesEditor({
  definitionId,
  initial,
  objects,
  canCreate,
}: {
  definitionId: string;
  initial: ChecklistPhotoRulesView;
  objects: readonly PhotoObjectView[];
  canCreate: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => rulesDraft(initial));
  const [newName, setNewName] = useState('');
  const client = useQueryClient();
  const { payload, valid, dirty, changes } = rulesDraftState(draft, saved);
  const choices = catalogChoices(objects, draft);
  const nameOf = (objectId: string) =>
    objects.find((object) => object.id === objectId)?.name ??
    saved.rules.find((rule) => rule.objectId === objectId)?.name ??
    '';
  const apply = (view: ChecklistPhotoRulesView) => {
    setSaved(view);
    setDraft(rulesDraft(view));
  };
  const mutation = useMutation({
    mutationFn: () => rulesApi.save(definitionId, { version: saved.version, ...payload }),
    retry: false,
    onSuccess: (view) => {
      apply(view);
      client.setQueryData(rulesKey(definitionId), view);
    },
  });
  const create = useMutation({
    mutationFn: () => rulesApi.createObject({ name: newName }),
    retry: false,
    onSuccess: (object) => {
      setNewName('');
      void client.invalidateQueries({ queryKey: photoObjectsKey });
      setDraft((current) =>
        current.some((rule) => rule.objectId === object.id)
          ? current
          : toggleRule(current, object.id),
      );
    },
  });
  const busy = mutation.isPending || create.isPending;
  if (!initial.canEdit)
    return (
      <ul className="text-sm">
        {saved.rules.map((rule) => (
          <li key={rule.objectId}>
            {rule.name}
            {rule.note ? ` — ${rule.note}` : ''}
          </li>
        ))}
        {!saved.rules.length && <li>{t.empty}</li>}
      </ul>
    );
  return (
    <div ref={dirty ? guardUnsaved : undefined} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {t.catalog}
          <InfoTip text={t.catalogHint} />
        </span>
        {choices.length ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.catalog}>
            {choices.map((object) => (
              <Button
                key={object.id}
                type="button"
                variant={object.selected ? 'secondary' : 'outline'}
                size="sm"
                aria-pressed={object.selected}
                disabled={busy}
                onClick={() => setDraft((current) => toggleRule(current, object.id))}
              >
                {object.selected ? null : <PlusIcon aria-hidden="true" />}
                {object.name}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.catalogEmpty}</p>
        )}
        {canCreate && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {t.newObject}
              <Input
                value={newName}
                maxLength={100}
                placeholder={t.newObjectPlaceholder}
                disabled={busy}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newName.trim()) {
                    event.preventDefault();
                    create.mutate();
                  }
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !newName.trim()}
              onClick={() => create.mutate()}
            >
              <PlusIcon aria-hidden="true" />
              {t.createObject}
            </Button>
          </div>
        )}
        {create.isError && (
          <p role="alert" className="text-sm text-destructive">
            {readError(create.error)}
          </p>
        )}
      </div>
      {draft.length > 0 && <p className="text-sm text-muted-foreground">{t.selected}</p>}
      <div className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto">
        {draft.map((rule) => (
          <RuleField
            key={rule.objectId}
            rule={rule}
            name={nameOf(rule.objectId)}
            busy={busy}
            change={(objectId, note) =>
              setDraft((current) =>
                current.map((item) => (item.objectId === objectId ? { ...item, note } : item)),
              )
            }
            remove={(objectId) => setDraft((current) => toggleRule(current, objectId))}
          />
        ))}
      </div>
      {!draft.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
      {dirty && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.dirty}: {changes}
        </p>
      )}
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          {t.invalid}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
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
