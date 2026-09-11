import { useState } from 'react';
import {
  RegionVerdict,
  RejectionReason,
  type ChecklistPhotoRuleView,
  type InspectionAnnotation,
  type PhotoObjectView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ChevronDownIcon, FocusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { IconButton } from '@/shared/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ObjectSwatch } from './object-swatch';
import type { InspectionEditor } from '../model/editor';

const t = messages(currentLocale()).photoInspection;
const OTHER = '__other__';

export function RegionFields({
  annotation,
  index,
  selected,
  editor,
  busy,
  rules,
  objects,
}: {
  annotation: InspectionAnnotation;
  index: number;
  selected: boolean;
  editor: InspectionEditor;
  busy: boolean;
  rules: readonly ChecklistPhotoRuleView[];
  objects: readonly PhotoObjectView[];
}) {
  const [touched, setTouched] = useState(false);
  const unnamed =
    !annotation.objectId && !annotation.objectName?.trim() && !annotation.comment.trim();
  const others = objects.filter((object) => !rules.some((rule) => rule.objectId === object.id));
  const otherSelected = !annotation.objectId && annotation.objectName !== undefined;
  const fromAi = annotation.sourceRunId !== null && annotation.sourceFindingIndex !== undefined;
  const chooseObject = (objectId: string | null) =>
    editor.editAnnotation(annotation.id, {
      objectId,
      objectName: objectId
        ? (rules.find((r) => r.objectId === objectId)?.name ??
          objects.find((o) => o.id === objectId)?.name)
        : (annotation.objectName ?? ''),
    });
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
          <ObjectSwatch
            objectId={annotation.objectId}
            objectName={annotation.objectName}
            rules={rules}
          />
          {index + 1}. {t.region}
        </IconButton>
        <div className="flex items-center gap-1">
          {fromAi && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={XIcon}
                  label={t.reject}
                  tooltip={t.hints.reject}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                >
                  {t.reject}
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {RejectionReason.options.map((reason) => (
                  <DropdownMenuItem
                    key={reason}
                    onSelect={() => editor.rejectRegion(annotation.id, reason)}
                  >
                    {t.rejectReasons[reason]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-1 text-sm font-medium">
          {t.objectName}
          <InfoTip text={t.objectHint} />
        </span>
        {rules.length > 0 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={t.objectSuggestions}>
            {rules.map((rule) => (
              <Button
                key={rule.objectId}
                type="button"
                variant={annotation.objectId === rule.objectId ? 'secondary' : 'outline'}
                size="sm"
                className="h-auto min-h-8 max-w-full whitespace-normal break-words"
                aria-pressed={annotation.objectId === rule.objectId}
                onClick={() => chooseObject(rule.objectId)}
              >
                <ObjectSwatch objectId={rule.objectId} rules={rules} />
                {rule.name}
              </Button>
            ))}
          </div>
        )}
        <SelectField
          label={t.objectCatalog}
          value={otherSelected ? OTHER : (annotation.objectId ?? '')}
          onChange={(value) => {
            if (value === OTHER)
              editor.editAnnotation(annotation.id, {
                objectId: null,
                objectName: annotation.objectName ?? '',
              });
            else chooseObject(value || null);
          }}
          options={[
            ...others.map((object) => ({ value: object.id, label: object.name })),
            { value: OTHER, label: t.objectOther },
          ]}
          placeholder="—"
          error={touched && unnamed ? t.nameRequired : undefined}
        />
        {otherSelected && (
          <FormField label={t.objectOther}>
            {(id) => (
              <Input
                id={id}
                value={annotation.objectName ?? ''}
                maxLength={100}
                placeholder={t.objectOtherPlaceholder}
                onBlur={() => setTouched(true)}
                onChange={(event) =>
                  editor.editAnnotation(annotation.id, { objectName: event.target.value })
                }
              />
            )}
          </FormField>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-1 text-sm font-medium">
          {t.verdict}
          <InfoTip text={t.verdictHint} />
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="max-w-full flex-wrap"
          value={annotation.verdict}
          aria-label={t.verdict}
          onValueChange={(value) => {
            const verdict = RegionVerdict.safeParse(value);
            if (verdict.success) editor.editAnnotation(annotation.id, { verdict: verdict.data });
          }}
        >
          {RegionVerdict.options.map((verdict) => (
            <ToggleGroupItem key={verdict} value={verdict} disabled={busy}>
              {t.verdicts[verdict]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
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
    </div>
  );
}
