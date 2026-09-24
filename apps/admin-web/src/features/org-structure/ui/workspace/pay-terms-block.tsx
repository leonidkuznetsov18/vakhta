import { CoinsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, StatusPill } from '@/components/app/page';
import { formatDate } from '@/lib/format';
import type { AppliedPayGroup, WorkspaceUnit } from '../../model/workspace';
import { fill, text } from './text';

/**
 * What pay conditions apply on this node (spec 015, AC-012): each attached group with its source
 * (own or inherited from an ancestor), its published version and how many assignments and people
 * it covers below this node. Amounts stay in the card; the structure shows names and counts.
 */
export function PayTermsBlock({
  row,
  onWhereUsed,
}: {
  readonly row: WorkspaceUnit;
  readonly onWhereUsed: (group: AppliedPayGroup) => void;
}) {
  return (
    <section
      aria-label={text.payTerms.heading}
      className="flex flex-col gap-1.5 rounded-lg border border-border px-2.5 py-2"
    >
      <h3 className="flex items-center gap-1 text-sm font-medium">
        <CoinsIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        {text.payTerms.heading}
        <InfoTip text={text.payTerms.hint} />
      </h3>
      {row.payGroups.length === 0 ? (
        <Muted className="text-xs">{text.payTerms.empty}</Muted>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{text.payTerms.group}</TableHead>
                <TableHead>{text.payTerms.source}</TableHead>
                <TableHead>{text.payTerms.version}</TableHead>
                <TableHead className="text-right">{text.payTerms.coverage}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.payGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>
                    {group.inheritedFrom ? (
                      <Muted>
                        {fill(text.payTerms.inheritedFrom, { unit: group.inheritedFrom })}
                      </Muted>
                    ) : (
                      <StatusPill tone="neutral">{text.payTerms.own}</StatusPill>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    v{group.version} ·{' '}
                    {fill(text.payTerms.since, { date: formatDate(group.validFrom) })}
                    {group.draftVersion && (
                      <StatusPill tone="accent" className="ml-1.5">
                        {fill(text.payTerms.draft, { n: group.draftVersion })}
                      </StatusPill>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fill(text.payTerms.assignments, { n: group.assignments })}
                    {group.people !== group.assignments && (
                      <Muted className="ml-1 text-xs">
                        {fill(text.payTerms.people, { n: group.people })}
                      </Muted>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => onWhereUsed(group)}
                    >
                      {text.payTerms.whereUsed}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
