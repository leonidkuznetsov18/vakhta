import { EllipsisVerticalIcon, RouteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Muted, StatusPill } from '@/components/app/page';
import { formatDate } from '@/lib/format';
import { TermMode, TermSource, TermStatus, type ResolvedComponent } from './model';
import { fill, money, text } from './text';

export interface ComponentActions {
  readonly onChange: (row: ResolvedComponent) => void;
  readonly onAdd: (row: ResolvedComponent) => void;
  readonly onRevert: (row: ResolvedComponent) => void;
}

function amount(value: number | null, unit: ResolvedComponent['unit'], currency: string) {
  if (value === null) return text.components.none;
  if (unit === 'COEFFICIENT') return `× ${value}`;
  return `${money(value, currency)} ${text.components.units[unit]}`;
}

function personalLabel(mode: TermMode, value: string): string {
  if (mode === TermMode.REPLACE) return fill(text.components.replace, { value });
  if (mode === TermMode.ADD) return fill(text.components.add, { value });
  return text.components.disabled;
}

function GroupCell({
  row,
  currency,
  showAmounts,
}: {
  readonly row: ResolvedComponent;
  readonly currency: string;
  readonly showAmounts: boolean;
}) {
  if (!showAmounts) return <Muted>{row.groupSourceLabel}</Muted>;
  return (
    <span className="flex min-w-0 flex-col">
      <span>{amount(row.groupValue, row.unit, currency)}</span>
      <span className="text-xs text-muted-foreground">{row.groupSourceLabel}</span>
    </span>
  );
}

function AppliedCell({
  row,
  currency,
  showAmounts,
}: {
  readonly row: ResolvedComponent;
  readonly currency: string;
  readonly showAmounts: boolean;
}) {
  const source = text.components.sources[row.appliedSource];
  if (!showAmounts) return <Muted>{source}</Muted>;
  const missing = row.appliedSource === TermSource.MISSING;
  return (
    <span className="flex flex-col items-end">
      <span className={missing ? 'text-muted-foreground' : 'font-semibold'}>
        {amount(row.applied, row.unit, currency)}
      </span>
      <span className="text-xs text-muted-foreground">{source}</span>
    </span>
  );
}

function PersonalCell({
  row,
  currency,
  showAmounts,
}: {
  readonly row: ResolvedComponent;
  readonly currency: string;
  readonly showAmounts: boolean;
}) {
  const personal = row.personal;
  if (!personal) return <Muted>{text.components.inherit}</Muted>;
  if (!showAmounts) return <Muted>{text.components.sources.PERSONAL}</Muted>;
  const value = amount(personal.value, row.unit, currency);
  const label = personalLabel(personal.mode, value);
  const period = personal.validTo
    ? `${formatDate(personal.validFrom)} – ${formatDate(personal.validTo)}`
    : fill(text.employment.since, { date: formatDate(personal.validFrom) });
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-1.5">
        <span>{label}</span>
        {personal.status === TermStatus.DRAFT && (
          <StatusPill tone="accent">{text.components.draft}</StatusPill>
        )}
      </span>
      <span className="text-xs text-muted-foreground">{period}</span>
    </span>
  );
}

function PathPopover({
  row,
  defaultOpen,
}: {
  readonly row: ResolvedComponent;
  readonly defaultOpen: boolean;
}) {
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={text.components.path}>
          <RouteIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          {text.components.path} · {text.components.keys[row.key]}
        </p>
        <ol className="flex flex-col gap-1 px-2.5 py-2 text-xs">
          {row.path.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{index + 1}</span>
              <span className={index === row.path.length - 1 ? 'font-medium' : undefined}>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}

function RowMenu({
  row,
  actions,
}: {
  readonly row: ResolvedComponent;
  readonly actions: ComponentActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={text.components.change}>
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={() => actions.onChange(row)}>
          {text.components.change}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onAdd(row)}>
          {text.components.addSupplement}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={row.personal === null} onSelect={() => actions.onRevert(row)}>
          {text.components.revert}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The card's answer to "what am I paid and why": each component with the group value, the
 * personal layer and what applies, and the resolution path behind an icon (CFG-07).
 */
export function ComponentsTable({
  rows,
  currency,
  editable,
  showAmounts,
  actions,
  pathOpenFor = null,
}: {
  readonly rows: readonly ResolvedComponent[];
  readonly currency: string;
  readonly editable: boolean;
  readonly showAmounts: boolean;
  readonly actions: ComponentActions;
  readonly pathOpenFor?: ResolvedComponent['key'] | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>{text.components.component}</TableHead>
            <TableHead>{text.components.fromGroup}</TableHead>
            <TableHead>{text.components.personal}</TableHead>
            <TableHead className="text-right">{text.components.applied}</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">{text.components.keys[row.key]}</TableCell>
              <TableCell>
                <GroupCell row={row} currency={currency} showAmounts={showAmounts} />
              </TableCell>
              <TableCell>
                <PersonalCell row={row} currency={currency} showAmounts={showAmounts} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <AppliedCell row={row} currency={currency} showAmounts={showAmounts} />
              </TableCell>
              <TableCell className="text-right">
                <span className="flex items-center justify-end gap-0.5">
                  <PathPopover row={row} defaultOpen={pathOpenFor === row.key} />
                  {editable && <RowMenu row={row} actions={actions} />}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
