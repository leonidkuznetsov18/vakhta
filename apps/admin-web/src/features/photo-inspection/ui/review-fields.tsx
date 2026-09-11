import { useState } from 'react';
import { useStore } from 'zustand';
import { InspectionReview } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { FocusIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { SelectField } from '@/components/app/fields';
import { RegionFields } from './region-fields';
import { PhotoNote } from './photo-note';
const t = messages(currentLocale()).photoInspection;

export function EditableReview({
  editor,
  busy,
  items = [],
}: {
  editor: InspectionEditor;
  busy: boolean;
  items?: string[];
}) {
  const [attachList] = useState(() => editor.attachRegionList);
  const state = useStore(editor.store);
  return (
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
      <SelectField
        label={t.status}
        hint={t.hints.status}
        value={state.review.status}
        onChange={(value) => editor.change({ status: InspectionReview.shape.status.parse(value) })}
        options={Object.entries(t.statuses).map(([value, label]) => ({ value, label }))}
      />
      <PhotoNote editor={editor} busy={busy} />
      {state.review.annotations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}
      <div ref={attachList} className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
        {state.review.annotations.map((annotation, index) => (
          <RegionFields
            key={annotation.id}
            annotation={annotation}
            index={index}
            selected={state.selected === annotation.id}
            editor={editor}
            busy={busy}
            items={items}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function ReadOnlyReview({ editor }: { editor: InspectionEditor }) {
  const [attachList] = useState(() => editor.attachRegionList);
  const state = useStore(editor.store);
  const review = state.review;
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <strong>{t.statuses[review.status]}</strong>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{review.comment}</p>
      <div ref={attachList} className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
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
            {a.objectName && <p className="break-words font-medium">{a.objectName}</p>}
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
