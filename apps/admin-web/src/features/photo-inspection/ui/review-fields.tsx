import { useStore } from 'zustand';
import { InspectionCategory, InspectionReview } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { FocusIcon, Trash2Icon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, SelectField } from '@/components/app/fields';
const t = messages(currentLocale()).photoInspection;

export function EditableReview({ editor, busy }: { editor: InspectionEditor; busy: boolean }) {
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
      <FormField
        label={t.reviewComment}
        hint={t.reviewCommentHelp}
        optional={state.review.status !== 'NOT_ASSESSABLE'}
      >
        {(id) => (
          <>
            <Textarea
              id={id}
              value={state.review.comment}
              maxLength={4000}
              required={state.review.status === 'NOT_ASSESSABLE'}
              aria-describedby={`${id}-help`}
              placeholder={t.reviewCommentPlaceholder}
              onChange={(e) => editor.change({ comment: e.target.value })}
            />
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              {t.reviewCommentHelp}
            </p>
          </>
        )}
      </FormField>
      {state.review.annotations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}
      <div className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto">
        {state.review.annotations.map((annotation, index) => (
          <div
            key={annotation.id}
            className={`flex min-w-0 flex-col gap-3 rounded-md border p-3 ${state.selected === annotation.id ? 'border-primary' : ''}`}
          >
            <IconButton
              className="self-start"
              icon={FocusIcon}
              label={`${index + 1}. ${t.categories[annotation.category]}`}
              tooltip={t.hints.selectRegion}
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => editor.select(annotation.id)}
            >
              {index + 1}. {t.categories[annotation.category]}
            </IconButton>
            <SelectField
              label={t.category}
              hint={t.hints.category}
              value={annotation.category}
              onChange={(value) =>
                editor.editAnnotation(annotation.id, {
                  category: InspectionCategory.parse(value),
                })
              }
              options={Object.entries(t.categories).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FormField label={t.comment} hint={t.hints.comment}>
              {(id) => (
                <Textarea
                  id={id}
                  value={annotation.comment}
                  maxLength={2000}
                  onChange={(e) =>
                    editor.editAnnotation(annotation.id, { comment: e.target.value })
                  }
                />
              )}
            </FormField>
            {annotation.geometry.type === 'RECTANGLE' && (
              <details>
                <summary className="cursor-pointer text-xs">{t.coordinates}</summary>
                <fieldset className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map((field) => (
                    <FormField
                      key={field}
                      label={t.coordinateLabels[field]}
                      hint={t.hints.coordinates[field]}
                    >
                      {(id) => (
                        <Input
                          id={id}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={
                            annotation.geometry.type === 'RECTANGLE'
                              ? Number((annotation.geometry[field] * 100).toFixed(2))
                              : 0
                          }
                          onChange={(e) =>
                            editor.coordinates(annotation.id, field, e.target.valueAsNumber / 100)
                          }
                        />
                      )}
                    </FormField>
                  ))}
                </fieldset>
              </details>
            )}
            {
              <IconButton
                className="self-start"
                icon={Trash2Icon}
                label={t.remove}
                tooltip={t.hints.remove}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => editor.remove(annotation.id)}
              >
                {t.remove}
              </IconButton>
            }
          </div>
        ))}
      </div>
      <FormField label={t.guidance} hint={t.guidanceHint} optional>
        {(id) => (
          <Textarea
            id={id}
            value={state.review.guidance}
            maxLength={4000}
            onChange={(e) => editor.change({ guidance: e.target.value })}
          />
        )}
      </FormField>
      <p className="text-xs text-muted-foreground">{t.guidanceHint}</p>
    </fieldset>
  );
}

export function ReadOnlyReview({
  review,
  select,
}: {
  review: InspectionReview;
  select: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <strong>{t.statuses[review.status]}</strong>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{review.comment}</p>
      {review.annotations.map((a, index) => (
        <div key={a.id} className="rounded-md border p-3">
          <IconButton
            icon={FocusIcon}
            label={`${index + 1}. ${t.categories[a.category]}`}
            tooltip={t.hints.selectRegion}
            size="sm"
            variant="ghost"
            onClick={() => select(a.id)}
          >
            {index + 1}. {t.categories[a.category]}
          </IconButton>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{a.comment}</p>
        </div>
      ))}
      {review.guidance && (
        <div>
          <strong>{t.guidance}</strong>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
            {review.guidance}
          </p>
        </div>
      )}
    </div>
  );
}
