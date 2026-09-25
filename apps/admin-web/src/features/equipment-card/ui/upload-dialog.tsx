import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentLinkInput, DocumentUploadQuery } from '@vakhta/contracts';
import { EQUIPMENT_DOCUMENT_KINDS } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { maintenanceApi, maintenanceKeys, maintenanceMessages } from '@/entities/maintenance';
import { AddDialog } from '@/components/app/add-dialog';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';
import { currentLocale } from '@/shared/config';
import { StateFilter } from '@/shared/ui/state-filter';
import {
  DocumentMode,
  EMPTY_UPLOAD,
  canSubmit,
  checkLink,
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
    LINK: t.documents.linkHint,
  };
  return texts[problem];
}

type TextField = 'title' | 'language' | 'edition' | 'sourceUrl';

/** The file picker or the address field, by the chosen mode. */
function SourceField({
  draft,
  onPick,
  onText,
}: {
  readonly draft: UploadDraft;
  readonly onPick: (file: File | null) => void;
  readonly onText: (field: TextField, value: string) => void;
}) {
  const t = maintenanceMessages();
  if (draft.mode === DocumentMode.LINK)
    return (
      <FormField label={t.documents.link} hint={t.documents.linkHint}>
        {(id) => (
          <Input
            id={id}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.sourceUrl}
            onChange={(event) => onText('sourceUrl', event.target.value)}
          />
        )}
      </FormField>
    );
  return (
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
  );
}

/** Kind, language and edition: what tells one manual from another. */
function DescriptionFields({
  draft,
  onText,
  onKind,
}: {
  readonly draft: UploadDraft;
  readonly onText: (field: TextField, value: string) => void;
  readonly onKind: (value: string) => void;
}) {
  const t = maintenanceMessages();
  // The kind takes a full row: three columns squeeze the optional labels out of the dialog.
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        className="sm:col-span-2"
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
  );
}

function UploadFields({
  draft,
  onPick,
  onText,
  onKind,
  onMode,
}: {
  readonly draft: UploadDraft;
  readonly onPick: (file: File | null) => void;
  readonly onText: (field: TextField, value: string) => void;
  readonly onKind: (value: string) => void;
  readonly onMode: (mode: DocumentMode) => void;
}) {
  const t = maintenanceMessages();
  return (
    <>
      <div className="flex items-center gap-2">
        <StateFilter
          label={t.documents.kind}
          value={draft.mode}
          onChange={onMode}
          options={[
            { value: DocumentMode.FILE, label: t.documents.modeFile },
            { value: DocumentMode.LINK, label: t.documents.modeLink },
          ]}
        />
        <InfoTip text={t.documents.modeHint} />
      </div>
      <SourceField draft={draft} onPick={onPick} onText={onText} />
      <FormField label={t.documents.docTitle}>
        {(id) => (
          <Input
            id={id}
            value={draft.title}
            onChange={(event) => onText('title', event.target.value)}
          />
        )}
      </FormField>
      <DescriptionFields draft={draft} onText={onText} onKind={onKind} />
      {draft.mode === DocumentMode.FILE ? (
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
      ) : null}
    </>
  );
}

/** The two ways to add a document; either one refreshes the card and closes the dialog. */
function useAddDocument(equipmentId: string, onClose: () => void) {
  const t = maintenanceMessages();
  const client = useQueryClient();
  const done = async (text: string) => {
    await client.invalidateQueries({ queryKey: maintenanceKeys.all });
    notifySuccess(text);
    onClose();
  };
  const upload = useMutation({
    mutationFn: (input: { file: File; meta: DocumentUploadQuery }) =>
      maintenanceApi.uploadDocument(equipmentId, input),
    onSuccess: () => done(t.documents.uploaded),
  });
  const addLink = useMutation({
    mutationFn: (input: DocumentLinkInput) => maintenanceApi.addDocumentLink(equipmentId, input),
    onSuccess: () => done(t.documents.linkAdded),
  });
  return { upload, addLink };
}

/** Add a manual to the machine: a stored PDF or a link to it on the web (FR-008, FR-010). */
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
  const { upload, addLink } = useAddDocument(equipmentId, onClose);
  const submitFile = () => {
    const checked = checkUpload(draft);
    setProblem(checked.ok ? null : checked.problem);
    if (checked.ok) upload.mutate({ file: checked.file, meta: checked.meta });
  };
  const submitLink = () => {
    const checked = checkLink(draft);
    setProblem(checked.ok ? null : checked.problem);
    if (checked.ok) addLink.mutate(checked.input);
  };
  const submit = draft.mode === DocumentMode.LINK ? submitLink : submitFile;
  const failure = upload.error ?? addLink.error;
  const error = problem ? problemText(problem) : null;
  return (
    <AddDialog
      hideTrigger
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t.documents.addTitle}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Feedback error={error ?? (failure ? describeError(failure) : null)} />
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
          onMode={(mode) => {
            setProblem(null);
            setDraft((current) => ({ ...current, mode }));
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            pending={upload.isPending || addLink.isPending}
            disabled={!canSubmit(draft)}
          >
            {t.documents.add}
          </Button>
        </div>
      </form>
    </AddDialog>
  );
}
