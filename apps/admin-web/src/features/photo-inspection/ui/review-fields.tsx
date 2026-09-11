import { useState } from 'react';
import { useStore } from 'zustand';
import type { ChecklistPhotoRuleView, PhotoObjectView } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { FocusIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { InfoTip } from '@/components/app/info-tip';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RegionFields } from './region-fields';
import { PhotoNote } from './photo-note';
const t = messages(currentLocale()).photoInspection;

export function EditableReview({
  editor,
  busy,
  rules = [],
  objects = [],
  onCreateObject,
}: {
  editor: InspectionEditor;
  busy: boolean;
  rules?: readonly ChecklistPhotoRuleView[];
  objects?: readonly PhotoObjectView[];
  /** Adds a catalog object typed into a region's list and resolves with the stored entry. */
  onCreateObject?: (name: string) => Promise<PhotoObjectView>;
}) {
  const [attachList] = useState(() => editor.attachRegionList);
  const state = useStore(editor.store);
  const review = state.review;
  const notAssessable = review.status === 'NOT_ASSESSABLE';
  return (
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
      <p className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t.outcome}:</span>
        <strong role="status" data-testid="review-outcome">
          {t.statuses[review.status]}
        </strong>
        <InfoTip text={t.outcomeHint} />
      </p>
      <div className="flex items-center gap-2">
        <Checkbox
          id="not-assessable"
          checked={notAssessable}
          onCheckedChange={(checked) => editor.setNotAssessable(checked === true)}
        />
        <Label htmlFor="not-assessable">{t.notAssessable}</Label>
        <InfoTip text={t.notAssessableHint} />
      </div>
      {review.status === 'COMPLIANT' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="reference-photo"
            checked={review.isReference}
            onCheckedChange={(checked) => editor.change({ isReference: checked === true })}
          />
          <Label htmlFor="reference-photo">{t.reference}</Label>
          <InfoTip text={t.referenceHint} />
        </div>
      )}
      <PhotoNote editor={editor} busy={busy} />
      {review.annotations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}
      <div ref={attachList} className="flex flex-col gap-3">
        {review.annotations.map((annotation, index) => (
          <RegionFields
            key={annotation.id}
            annotation={annotation}
            index={index}
            selected={state.selected === annotation.id}
            editor={editor}
            busy={busy}
            rules={rules}
            objects={objects}
            onCreateObject={onCreateObject}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function ReadOnlyReview({
  editor,
  objects = [],
}: {
  editor: InspectionEditor;
  objects?: readonly PhotoObjectView[];
}) {
  const [attachList] = useState(() => editor.attachRegionList);
  const state = useStore(editor.store);
  const review = state.review;
  const name = (a: (typeof review.annotations)[number]) =>
    (a.objectId && objects.find((o) => o.id === a.objectId)?.name) || a.objectName;
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <strong>{t.statuses[review.status]}</strong>
      {review.notAssessableReason && <p>{t.reasons[review.notAssessableReason]}</p>}
      {review.isReference && <p>{t.reference}</p>}
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{review.comment}</p>
      <div ref={attachList} className="flex flex-col gap-3">
        {review.annotations.map((a, index) => (
          <div
            key={a.id}
            data-region-id={a.id}
            className={`rounded-md border p-3 ${state.selected === a.id ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600' : ''}`}
          >
            <IconButton
              icon={FocusIcon}
              label={`${index + 1}. ${t.region}`}
              tooltip={t.hints.selectRegion}
              size="sm"
              variant="ghost"
              aria-pressed={state.selected === a.id}
              onClick={() => editor.select(a.id)}
            >
              {index + 1}. {t.region}
            </IconButton>
            {name(a) && <p className="break-words font-medium">{name(a)}</p>}
            <p className="text-muted-foreground">{t.verdicts[a.verdict]}</p>
            {a.comment && (
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                {a.comment}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
