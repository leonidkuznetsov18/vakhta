import { useState } from 'react';
import { ArrowRightIcon, InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AddDialog } from '@/components/app/add-dialog';
import { DateField } from '@/components/app/date-picker';
import { FormField } from '@/components/app/fields';
import { Muted } from '@/components/app/page';
import { ComponentKey, TermSource, type Assignment, type ResolvedComponent } from './model';
import { money, text } from './text';

export const ExceptionDecision = { KEEP: 'KEEP', REPLACE: 'REPLACE', INHERIT: 'INHERIT' } as const;
export type ExceptionDecision = (typeof ExceptionDecision)[keyof typeof ExceptionDecision];

const DECISIONS: readonly ExceptionDecision[] = [
  ExceptionDecision.KEEP,
  ExceptionDecision.REPLACE,
  ExceptionDecision.INHERIT,
];
const DECISION_LABEL: Record<ExceptionDecision, string> = {
  KEEP: text.transfer.keep,
  REPLACE: text.transfer.replace,
  INHERIT: text.transfer.inherit,
};

export interface TransferTarget {
  readonly id: string;
  readonly path: readonly string[];
  readonly groupName: string;
  readonly groupBase: number;
}

type Decisions = ReadonlyMap<string, ExceptionDecision>;

function toDecision(value: string): ExceptionDecision {
  return DECISIONS.find((decision) => decision === value) ?? ExceptionDecision.KEEP;
}

function SourcesCompare({
  assignment,
  base,
  target,
  currency,
}: {
  readonly assignment: Assignment;
  readonly base: ResolvedComponent | undefined;
  readonly target: TransferTarget | null;
  readonly currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 rounded-md border border-border p-2.5 text-sm sm:grid-cols-[1fr_auto_1fr]">
      <div>
        <Muted className="text-xs">{text.transfer.old}</Muted>
        <p>{assignment.nodePath.join(' › ')}</p>
        <p className="text-xs text-muted-foreground">
          {assignment.payGroup?.name} v{assignment.payGroup?.version} ·{' '}
          {money(base?.groupValue ?? null, currency)}
        </p>
      </div>
      <ArrowRightIcon
        aria-hidden="true"
        className="hidden size-4 self-center text-muted-foreground sm:block"
      />
      <div>
        <Muted className="text-xs">{text.transfer.new}</Muted>
        <p>{target?.path.join(' › ')}</p>
        <p className="text-xs text-muted-foreground">
          {target?.groupName} · {money(target?.groupBase ?? null, currency)}
        </p>
      </div>
    </div>
  );
}

function ExceptionsTable({
  personal,
  currency,
  decisions,
  onDecide,
}: {
  readonly personal: readonly ResolvedComponent[];
  readonly currency: string;
  readonly decisions: Decisions;
  readonly onDecide: (key: string, decision: ExceptionDecision) => void;
}) {
  if (personal.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{text.transfer.exceptions}</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{text.components.component}</TableHead>
              <TableHead>{text.components.personal}</TableHead>
              <TableHead className="w-44">{text.transfer.decision}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personal.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{text.components.keys[row.key]}</TableCell>
                <TableCell className="tabular-nums">
                  {money(row.personal?.value ?? null, currency)} {text.components.units[row.unit]}
                  {row.appliedSource === TermSource.PERSONAL
                    ? ''
                    : ` · ${text.components.draft.toLowerCase()}`}
                </TableCell>
                <TableCell>
                  <NativeSelect
                    aria-label={`${text.transfer.decision}: ${text.components.keys[row.key]}`}
                    value={decisions.get(row.key) ?? ExceptionDecision.KEEP}
                    onChange={(event) => onDecide(row.key, toDecision(event.target.value))}
                  >
                    {DECISIONS.map((decision) => (
                      <NativeSelectOption key={decision} value={decision}>
                        {DECISION_LABEL[decision]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Muted className="text-xs">{text.transfer.decisionHint}</Muted>
    </div>
  );
}

/**
 * PROC-06 from the card: the new node, what each component will resolve to there, and an
 * explicit decision for every personal exception (CFG-06: nothing is dropped silently).
 */
export function TransferDialog({
  assignment,
  components,
  targets,
  currency,
  today,
  onClose,
  onSubmit,
}: {
  readonly assignment: Assignment;
  readonly components: readonly ResolvedComponent[];
  readonly targets: readonly TransferTarget[];
  readonly currency: string;
  readonly today: string;
  readonly onClose: () => void;
  readonly onSubmit: (targetId: string, validFrom: string, decisions: Decisions) => void;
}) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [validFrom, setValidFrom] = useState(today);
  const personal = components.filter((row) => row.personal !== null);
  const [decisions, setDecisions] = useState<Map<string, ExceptionDecision>>(
    new Map(personal.map((row) => [row.key, ExceptionDecision.KEEP])),
  );
  const target = targets.find((row) => row.id === targetId) ?? null;
  const base = components.find((row) => row.key === ComponentKey.BASE_SALARY);
  return (
    <AddDialog
      title={text.transfer.title}
      open
      onOpenChange={(open) => !open && onClose()}
      hideTrigger
      wide
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <FormField label={text.transfer.target}>
            {(id) => (
              <NativeSelect
                id={id}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                {targets.map((row) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.path.join(' › ')}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <DateField label={text.transfer.date} value={validFrom} onChange={setValidFrom} />
        </div>
        <SourcesCompare assignment={assignment} base={base} target={target} currency={currency} />
        <ExceptionsTable
          personal={personal}
          currency={currency}
          decisions={decisions}
          onDecide={(key, decision) => setDecisions(new Map(decisions).set(key, decision))}
        />
        <Alert>
          <InfoIcon />
          <AlertTitle>{text.transfer.openBlocks}</AlertTitle>
          <AlertDescription>{text.transfer.openBlocksNote}</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {text.editor.cancel}
          </Button>
          <Button
            type="button"
            disabled={!target}
            onClick={() => onSubmit(targetId, validFrom, decisions)}
          >
            {text.transfer.submit}
          </Button>
        </DialogFooter>
      </div>
    </AddDialog>
  );
}
