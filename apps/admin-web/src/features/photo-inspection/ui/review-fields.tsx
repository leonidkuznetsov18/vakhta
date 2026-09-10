import { useStore } from 'zustand';
import { InspectionCategory, InspectionReview } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
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
        value={state.review.status}
        onChange={(value) => editor.change({ status: InspectionReview.shape.status.parse(value) })}
        options={Object.entries(t.statuses).map(([value, label]) => ({ value, label }))}
      />
      <FormField label={t.reviewComment}>
        {(id) => (
          <Textarea
            id={id}
            value={state.review.comment}
            maxLength={4000}
            onChange={(e) => editor.change({ comment: e.target.value })}
          />
        )}
      </FormField>
      {state.review.annotations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}
      <div className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto">
        {state.review.annotations.map((annotation, index) => (
          <div
            key={annotation.id}
            className={`min-w-0 rounded-md border p-3 ${state.selected === annotation.id ? 'border-primary' : ''}`}
          >
            <Button variant="ghost" size="sm" onClick={() => editor.select(annotation.id)}>
              {index + 1}. {t.categories[annotation.category]}
            </Button>
            <SelectField
              label={t.category}
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
            <FormField label={t.comment}>
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
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">{t.coordinates}</summary>
                <fieldset className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map((field) => (
                    <label key={field} className="text-xs">
                      {t.coordinateLabels[field]}
                      <Input
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
                    </label>
                  ))}
                </fieldset>
              </details>
            )}
            {
              <Button size="sm" variant="ghost" onClick={() => editor.remove(annotation.id)}>
                {t.remove}
              </Button>
            }
          </div>
        ))}
      </div>
      <FormField label={t.guidance}>
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
          <Button size="sm" variant="ghost" onClick={() => select(a.id)}>
            {index + 1}. {t.categories[a.category]}
          </Button>
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
