import { useState } from 'react';
import type { InspectionAnnotation } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ChevronDownIcon, FocusIcon, Trash2Icon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { FormField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { IconButton } from '@/shared/ui/icon-button';
import type { InspectionEditor } from '../model/editor';

const t = messages(currentLocale()).photoInspection;

export function RegionFields({
  annotation,
  index,
  selected,
  editor,
  busy,
  items,
}: {
  annotation: InspectionAnnotation;
  index: number;
  selected: boolean;
  editor: InspectionEditor;
  busy: boolean;
  items: string[];
}) {
  const [touched, setTouched] = useState(false);
  const unnamed = !annotation.objectName?.trim() && !annotation.comment.trim();
  const name = (value: string) =>
    editor.editAnnotation(annotation.id, { objectName: value || undefined });
  return (
    <div
      data-region-id={annotation.id}
      className={`flex min-w-0 flex-col gap-3 rounded-md border p-3 ${selected ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <IconButton
          icon={FocusIcon}
          label={`${index + 1}. ${t.region}`}
          tooltip={t.hints.selectRegion}
          aria-pressed={selected}
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => editor.select(annotation.id)}
        >
          {index + 1}. {t.region}
        </IconButton>
        <IconButton
          icon={Trash2Icon}
          label={t.remove}
          tooltip={t.hints.remove}
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={() => editor.remove(annotation.id)}
        >
          <span className="sr-only">{t.remove}</span>
        </IconButton>
      </div>
      <FormField
        label={t.objectName}
        hint={t.objectNameHint}
        error={touched && unnamed ? t.nameRequired : null}
      >
        {(id) => (
          <Input
            id={id}
            value={annotation.objectName ?? ''}
            maxLength={100}
            placeholder={t.objectNamePlaceholder}
            onBlur={() => {
              name(annotation.objectName?.trim() ?? '');
              setTouched(true);
            }}
            onChange={(event) => name(event.target.value)}
          />
        )}
      </FormField>
      {items.length > 0 && (
        <div
          className="flex max-h-28 flex-wrap gap-1 overflow-y-auto"
          role="group"
          aria-label={t.objectSuggestions}
        >
          {items.map((item) => (
            <Button
              key={item}
              type="button"
              variant={annotation.objectName === item ? 'secondary' : 'outline'}
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal break-words"
              aria-pressed={annotation.objectName === item}
              onClick={() => name(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      )}
      <Collapsible defaultOpen={Boolean(annotation.comment)}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal text-left"
          >
            <ChevronDownIcon aria-hidden="true" />
            {annotation.comment ? t.detailsAdded : t.addDetails}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <FormField label={t.regionDetails} hint={t.regionDetailsHint} optional>
            {(id) => (
              <Textarea
                id={id}
                value={annotation.comment}
                maxLength={2000}
                rows={2}
                placeholder={t.regionDetailsPlaceholder}
                onChange={(event) =>
                  editor.editAnnotation(annotation.id, { comment: event.target.value })
                }
              />
            )}
          </FormField>
        </CollapsibleContent>
      </Collapsible>
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
                    onChange={(event) =>
                      editor.coordinates(annotation.id, field, event.target.valueAsNumber / 100)
                    }
                  />
                )}
              </FormField>
            ))}
          </fieldset>
        </details>
      )}
    </div>
  );
}
