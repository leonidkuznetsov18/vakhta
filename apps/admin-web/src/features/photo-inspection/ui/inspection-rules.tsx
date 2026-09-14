import type { ChecklistPhotoRuleView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ChevronDownIcon, PencilIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { IconButton } from '@/shared/ui/icon-button';
import { ObjectSwatch } from './object-swatch';

const t = messages(currentLocale()).photoInspection;
export function InspectionRules({
  rules,
  edit,
}: {
  rules: readonly ChecklistPhotoRuleView[];
  edit?: { href: string; onNavigate: () => void; disabled: boolean } | undefined;
}) {
  return (
    <Collapsible className="min-w-0 rounded-md border p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal text-left"
          >
            <ChevronDownIcon aria-hidden="true" />
            {t.rulesReference} ({rules.length})
          </Button>
        </CollapsibleTrigger>
        {edit && (
          <IconButton
            icon={PencilIcon}
            label={messages(currentLocale()).checklistPhotoRules.editRules}
            tooltip={messages(currentLocale()).checklistPhotoRules.editRules}
            variant="ghost"
            size="icon"
            disabled={edit.disabled}
            asChild={!edit.disabled}
          >
            {edit.disabled ? null : (
              <a
                href={edit.href}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  edit.onNavigate();
                }}
              />
            )}
          </IconButton>
        )}
      </div>
      <CollapsibleContent className="space-y-2 p-2">
        <p className="text-xs text-muted-foreground">{t.prohibitedItemsHint}</p>
        {rules.length ? (
          <ul className="space-y-2 break-words">
            {rules.map((rule) => (
              <li key={rule.objectId}>
                <strong className="inline-flex items-center gap-2">
                  <ObjectSwatch objectId={rule.objectId} colors={rules} />
                  {rule.name}
                </strong>
                {rule.note && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {t.ruleNote}: {rule.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t.noProhibitedItems}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
