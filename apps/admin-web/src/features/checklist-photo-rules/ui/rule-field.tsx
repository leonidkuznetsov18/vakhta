import { ChevronDownIcon, Trash2Icon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTip } from '@/components/app/info-tip';
import { IconButton } from '@/shared/ui/icon-button';
import type { RuleField as Field } from '../model/rules-draft';

const t = messages(currentLocale()).checklistPhotoRules;
export function RuleField({
  field,
  busy,
  invalid,
  change,
  remove,
}: {
  field: Field;
  busy: boolean;
  invalid: boolean;
  change: (
    id: string,
    patch: Partial<Pick<Field, 'value' | 'clarification' | 'exceptions'>>,
  ) => void;
  remove: (id: string) => void;
}) {
  const hasDetails = Boolean(field.clarification.trim() || field.exceptions.trim());
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="flex items-end gap-2">
        <label htmlFor={field.id} className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          {t.item}
          <Input
            id={field.id}
            value={field.value}
            maxLength={100}
            disabled={busy}
            placeholder={t.itemPlaceholder}
            aria-invalid={invalid}
            onChange={(event) => change(field.id, { value: event.target.value })}
          />
        </label>
        <IconButton
          icon={Trash2Icon}
          label={t.remove}
          tooltip={t.remove}
          variant="ghost"
          size="icon-lg"
          disabled={busy}
          onClick={() => remove(field.id)}
        >
          <span className="sr-only">{t.remove}</span>
        </IconButton>
      </div>
      <Collapsible className="mt-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="max-w-full gap-2 whitespace-normal text-left"
          >
            <ChevronDownIcon aria-hidden="true" />
            {hasDetails ? t.detailsAdded : t.details}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="flex items-center gap-2">
                <label htmlFor={`${field.id}-clarification`}>{t.clarification}</label>
                <InfoTip text={t.clarificationHint} />
              </span>
              <Textarea
                id={`${field.id}-clarification`}
                value={field.clarification}
                maxLength={300}
                rows={2}
                placeholder={t.clarificationPlaceholder}
                disabled={busy}
                onChange={(event) => change(field.id, { clarification: event.target.value })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="flex items-center gap-2">
                <label htmlFor={`${field.id}-exceptions`}>{t.exceptions}</label>
                <InfoTip text={t.exceptionsHint} />
              </span>
              <Textarea
                id={`${field.id}-exceptions`}
                value={field.exceptions}
                maxLength={300}
                rows={2}
                placeholder={t.exceptionsPlaceholder}
                disabled={busy}
                onChange={(event) => change(field.id, { exceptions: event.target.value })}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
