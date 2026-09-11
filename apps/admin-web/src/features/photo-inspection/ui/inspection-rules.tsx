import type { PhotoRuleDetail } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ChevronDownIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const t = messages(currentLocale()).photoInspection;
export function InspectionRules({
  items,
  details,
}: {
  items: string[];
  details: PhotoRuleDetail[];
}) {
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
          {t.rulesReference} ({items.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 p-2">
        <p className="text-xs text-muted-foreground">{t.prohibitedItemsHint}</p>
        {items.length ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto break-words">
            {items.map((item) => {
              const detail = details.find((entry) => entry.item === item);
              return (
                <li key={item}>
                  <strong>{item}</strong>
                  {detail?.clarification && (
                    <p className="whitespace-pre-wrap">{detail.clarification}</p>
                  )}
                  {detail?.exceptions && (
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {t.ruleExceptions}: {detail.exceptions}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t.noProhibitedItems}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
