import { ChevronDownIcon, Trash2Icon } from 'lucide-react';
import { MAX_PHOTO_RULE_NOTE } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTip } from '@/components/app/info-tip';
import { IconButton } from '@/shared/ui/icon-button';
import type { RuleDraft } from '../model/rules-draft';

const t = messages(currentLocale()).checklistPhotoRules;
export function RuleField({
  rule,
  name,
  busy,
  change,
  remove,
}: {
  rule: RuleDraft;
  name: string;
  busy: boolean;
  change: (objectId: string, note: string) => void;
  remove: (objectId: string) => void;
}) {
  const noteId = `rule-note-${rule.objectId}`;
  return (
    <div className="min-w-0 rounded-md border p-3" data-testid="photo-rule">
      <div className="flex items-center justify-between gap-2">
        <strong className="min-w-0 break-words text-sm">{name}</strong>
        <IconButton
          icon={Trash2Icon}
          label={`${t.remove}: ${name}`}
          tooltip={t.remove}
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={() => remove(rule.objectId)}
        >
          <span className="sr-only">
            {t.remove}: {name}
          </span>
        </IconButton>
      </div>
      <Collapsible className="mt-1" defaultOpen={Boolean(rule.note)}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="max-w-full gap-2 whitespace-normal text-left"
          >
            <ChevronDownIcon aria-hidden="true" />
            {t.note}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              <label htmlFor={noteId}>
                {t.note}: {name}
              </label>
              <InfoTip text={t.noteHint} />
            </span>
            <Textarea
              id={noteId}
              value={rule.note}
              maxLength={MAX_PHOTO_RULE_NOTE}
              rows={2}
              placeholder={t.notePlaceholder}
              disabled={busy}
              onChange={(event) => change(rule.objectId, event.target.value)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
