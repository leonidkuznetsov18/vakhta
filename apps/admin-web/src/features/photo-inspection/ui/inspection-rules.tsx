import type { ChecklistPhotoRuleView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ChevronDownIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ObjectSwatch } from './object-swatch';

const t = messages(currentLocale()).photoInspection;
export function InspectionRules({ rules }: { rules: readonly ChecklistPhotoRuleView[] }) {
  return (
    <Collapsible className="min-w-0 rounded-md border p-2 text-sm">
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
      <CollapsibleContent className="space-y-2 p-2">
        <p className="text-xs text-muted-foreground">{t.prohibitedItemsHint}</p>
        {rules.length ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto break-words">
            {rules.map((rule) => (
              <li key={rule.objectId}>
                <strong className="inline-flex items-center gap-2">
                  <ObjectSwatch objectId={rule.objectId} rules={rules} />
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
