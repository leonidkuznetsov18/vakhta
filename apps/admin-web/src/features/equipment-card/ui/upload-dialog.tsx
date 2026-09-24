import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentUploadQuery } from '@vakhta/contracts';
import { EQUIPMENT_DOCUMENT_KINDS } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { maintenanceApi, maintenanceKeys, maintenanceMessages } from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';
import { currentLocale } from '@/shared/config';
import {
  EMPTY_UPLOAD,
  checkUpload,
  titleFromFile,
  type UploadDraft,
  type UploadProblem,
} from '../model/documents';

function problemText(problem: UploadProblem): string {
  const t = maintenanceMessages();
  const texts: Readonly<Record<UploadProblem, string>> = {
    FILE: t.errors.DOCUMENT_INVALID,
    TOO_LARGE: t.errors.DOCUMENT_TOO_LARGE,
    FIELDS: messages(currentLocale()).ui.common.invalidValue,
  };
  return texts[problem];
}

type TextField = 'title' | 'language' | 'edition' | 'sourceUrl';

function UploadFields({
  draft,
  onPick,
  onText,
  onKind,
}: {
  readonly draft: UploadDraft;
  readonly onPick: (file: File | null) => void;
  readonly onText: (field: TextField, value: string) => void;
  readonly onKind: (value: string) => void;
}) {
  const t = maintenanceMessages();
  return (
    <>
      <FormField label={t.documents.file}>
        {(id) => (
          <Input
            id={id}
            type="file"
            accept="application/pdf"
            onChange={(event) => onPick(event.target.files?.item(0) ?? null)}
          />
        )}
      </FormField>
      <FormField label={t.documents.docTitle}>
        {(id) => (
          <Input
            id={id}
            value={draft.title}
            onChange={(event) => onText('title', event.target.value)}
          />
        )}
      </FormField>
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField
          label={t.documents.kind}
          value={draft.kind}
          onChange={onKind}
          options={EQUIPMENT_DOCUMENT_KINDS.map((value) => ({
            value,
            label: t.documentKind[value],
          }))}
        />
        <FormField label={t.documents.language} optional>
          {(id) => (
            <Input
              id={id}
              value={draft.language}
              onChange={(event) => onText('language', event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t.documents.edition} optional>
          {(id) => (
            <Input
              id={id}
              value={draft.edition}
              onChange={(event) => onText('edition', event.target.value)}
            />
          )}
        </FormField>
      </div>
      <FormField label={t.documents.sourceUrl} hint={t.documents.sourceUrlHint} optional>
        {(id) => (
          <Input
            id={id}
            type="url"
            value={draft.sourceUrl}
            onChange={(event) => onText('sourceUrl', event.target.value)}
          />
        )}
      </FormField>
    </>
  );
}

/** Upload a manual or another PDF to the machine (FR-010, FR-011). */
export function UploadDialog({
  equipmentId,
  onClose,
}: {
  readonly equipmentId: string;
  readonly onClose: () => void;
}) {
  const t = maintenanceMessages();
  const [draft, setDraft] = useState<UploadDraft>(EMPTY_UPLOAD);
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: (input: { file: File; meta: DocumentUploadQuery }) =>
      maintenanceApi.uploadDocument(equipmentId, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(t.documents.uploaded);
      onClose();
    },
  });
  const submit = () => {
    const checked = checkUpload(draft);
    setProblem(checked.ok ? null : checked.problem);
    if (checked.ok) upload.mutate({ file: checked.file, meta: checked.meta });
  };
  const error = problem ? problemText(problem) : null;
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t.documents.uploadTitle}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Feedback error={error ?? (upload.error ? describeError(upload.error) : null)} />
        <UploadFields
          draft={draft}
          onPick={(file) =>
            setDraft((current) => ({
              ...current,
              file,
              title: current.title || (file ? titleFromFile(file) : ''),
            }))
          }
          onText={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
          onKind={(value) =>
            setDraft((current) => ({
              ...current,
              kind: EQUIPMENT_DOCUMENT_KINDS.find((kind) => kind === value) ?? current.kind,
            }))
          }
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" pending={upload.isPending} disabled={!draft.file}>
            {t.documents.upload}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
