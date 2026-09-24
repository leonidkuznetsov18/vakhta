import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MaterialsUsedKind,
  type RecordCompletionCommand,
  type WorkDetail,
  type WorkOperationView,
} from '@vakhta/contracts';
import { answerNeedsReason } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { DateField } from '@/components/app/date-picker';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { describeError } from '@/errors';
import { todayIso } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { currentLocale } from '@/shared/config';
import {
  RECORDABLE_RESULTS,
  initialRecord,
  toRecordCommand,
  withAnswer,
  type RecordDraft,
  type RecordField,
  type RecordableResult,
} from '../model/record-draft';

const RESULTS = new Set<string>(RECORDABLE_RESULTS);
const MATERIAL_KINDS = new Set<string>(Object.values(MaterialsUsedKind));

function isResult(value: string): value is RecordableResult {
  return RESULTS.has(value);
}

function isMaterialsKind(value: string): value is MaterialsUsedKind {
  return MATERIAL_KINDS.has(value);
}

interface DraftProps {
  readonly draft: RecordDraft;
  readonly setDraft: (draft: RecordDraft) => void;
  readonly error: (field: RecordField) => string | null;
}

function AnswerRow({
  operation,
  props,
}: {
  readonly operation: WorkOperationView;
  readonly props: DraftProps;
}) {
  const t = maintenanceMessages();
  const answer = props.draft.answers.get(operation.ordinal);
  const set = (patch: Parameters<typeof withAnswer>[2]) =>
    props.setDraft(withAnswer(props.draft, operation.ordinal, patch));
  return (
    <FormField
      label={`${operation.ordinal}. ${operation.text}`}
      error={props.error(`answer:${operation.ordinal}`)}
    >
      {(id) => (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            id={id}
            type="single"
            variant="outline"
            size="sm"
            className="max-w-full flex-wrap justify-start"
            value={answer?.result ?? ''}
            onValueChange={(value) => (isResult(value) ? set({ result: value }) : undefined)}
          >
            {RECORDABLE_RESULTS.map((result) => (
              <ToggleGroupItem key={result} value={result}>
                {t.operationResult[result]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {answer?.result && answerNeedsReason(answer.result) ? (
            <Input
              aria-label={t.workCard.recordReason}
              placeholder={t.workCard.recordReason}
              value={answer.reason}
              onChange={(event) => set({ reason: event.target.value })}
            />
          ) : null}
        </div>
      )}
    </FormField>
  );
}

function MaterialsField({ props }: { readonly props: DraftProps }) {
  const t = maintenanceMessages().workCard;
  const { draft, setDraft } = props;
  return (
    <FormField label={t.materialsUsed} error={props.error('materialsText')}>
      {(id) => (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            id={id}
            type="single"
            variant="outline"
            size="sm"
            className="justify-start"
            value={draft.materialsKind}
            onValueChange={(value) =>
              isMaterialsKind(value) ? setDraft({ ...draft, materialsKind: value }) : undefined
            }
          >
            <ToggleGroupItem value={MaterialsUsedKind.AS_PLANNED}>
              {t.materialsAsPlanned}
            </ToggleGroupItem>
            <ToggleGroupItem value={MaterialsUsedKind.OTHER}>{t.materialsOther}</ToggleGroupItem>
          </ToggleGroup>
          {draft.materialsKind === MaterialsUsedKind.OTHER ? (
            <Textarea
              aria-label={t.materialsOtherText}
              placeholder={t.materialsOtherText}
              rows={2}
              value={draft.materialsText}
              onChange={(event) => setDraft({ ...draft, materialsText: event.target.value })}
            />
          ) : null}
        </div>
      )}
    </FormField>
  );
}

function useRecord(work: WorkDetail, onDone: () => void) {
  const t = maintenanceMessages();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: RecordCompletionCommand) =>
      maintenanceApi.recordCompletion(work.id, command),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.workCard.recorded);
      onDone();
    },
  });
}

/** Planned work done on paper, entered for the mechanic; it then goes to review (AC-039). */
export function RecordCompletionDialog({
  work,
  onClose,
}: {
  readonly work: WorkDetail;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const required = messages(currentLocale()).ui.common.required;
  const today = todayIso();
  const [draft, setDraft] = useState(() => initialRecord(work, today));
  const [invalid, setInvalid] = useState<ReadonlySet<RecordField>>(new Set());
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const record = useRecord(work, onClose);
  const props: DraftProps = {
    draft,
    setDraft,
    error: (field) => (invalid.has(field) ? required : null),
  };
  const dateError = props.error('performedOn');
  const submit = () => {
    const checked = toRecordCommand(work, draft, today);
    setInvalid(checked.ok ? new Set() : checked.fields);
    if (checked.ok) record.mutate(checked.value);
  };
  return (
    <AddDialog
      hideTrigger
      wide
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={format(t.workCard.recordTitle, { number: work.number })}
      hint={t.workCard.recordHint}
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Feedback error={record.error ? describeError(record.error) : null} />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label={t.workCard.recordPerformer}
            value={draft.performerId}
            onChange={(performerId) => setDraft({ ...draft, performerId })}
            options={(mechanics.data ?? []).map((option) => ({
              value: option.id,
              label: option.fullName,
            }))}
            error={props.error('performerId')}
            required
          />
          <DateField
            label={t.workCard.recordDate}
            value={draft.performedOn}
            maxDate={today}
            onChange={(performedOn) => setDraft({ ...draft, performedOn })}
            {...(dateError ? { error: dateError } : {})}
          />
        </div>
        <h3 className="font-medium">{t.workCard.operations}</h3>
        {work.operations.map((operation) => (
          <AnswerRow key={operation.id} operation={operation} props={props} />
        ))}
        {work.materials.length ? <MaterialsField props={props} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" pending={record.isPending}>
            {t.workCard.recordSave}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
