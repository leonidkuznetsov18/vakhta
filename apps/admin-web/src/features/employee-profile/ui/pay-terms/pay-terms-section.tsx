import { useState } from 'react';
import { ChevronRightIcon, HistoryIcon, PlusIcon, StarIcon } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, StatusPill, type PillTone } from '@/components/app/page';
import { formatDate } from '@/lib/format';
import { ComponentsTable } from './components-table';
import { AdjustmentDialog, LevelChangePopover, TermEditor } from './editors';
import {
  AssignmentState,
  ComponentKey,
  TermMode,
  TermStatus,
  monthPreview,
  type Assignment,
  type Employment,
  type PayTerms,
  type ResolvedComponent,
} from './model';
import { TransferDialog, type TransferTarget } from './transfer-dialog';
import { fill, money, text } from './text';

export type PayTermsAccess = 'NAMES' | 'READ' | 'WRITE';

type EditMode = typeof TermMode.REPLACE | typeof TermMode.ADD;

/** Prototype-only switches that open editors for the screenshots. */
export interface PayTermsDemo {
  readonly editor?: { readonly key: ResolvedComponent['key']; readonly mode: EditMode };
  readonly adjustment?: boolean;
  readonly level?: boolean;
  readonly transfer?: boolean;
  readonly historyOpen?: boolean;
  readonly pathFor?: ResolvedComponent['key'];
}

const STATE_TONE: Record<Assignment['state'], PillTone> = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  ENDED: 'neutral',
};

function periodOf(validFrom: string, validTo: string | null) {
  if (validTo) return `${formatDate(validFrom)} – ${formatDate(validTo)}`;
  return fill(text.employment.since, { date: formatDate(validFrom) });
}

function AssignmentRow({
  row,
  selected,
  onSelect,
}: {
  readonly row: Assignment;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
        selected && 'bg-muted ring-1 ring-inset ring-border',
      )}
    >
      {row.isPrimary && row.state === AssignmentState.ACTIVE && (
        <StarIcon
          aria-label={text.assignment.primary}
          className="size-3.5 shrink-0 fill-amber-400 text-amber-500"
        />
      )}
      <span className="min-w-0 font-medium">{row.nodePath.join(' › ')}</span>
      <span>{row.position}</span>
      <span className="text-muted-foreground">{row.level?.name ?? text.assignment.noLevel}</span>
      <span className="text-muted-foreground">
        {row.payGroup ? `${row.payGroup.name} v${row.payGroup.version}` : text.assignment.noGroup}
      </span>
      {row.share < 100 && (
        <span className="text-muted-foreground">
          {fill(text.assignment.share, { n: row.share })}
        </span>
      )}
      {row.fte < 1 && (
        <span className="text-muted-foreground">{fill(text.assignment.fte, { n: row.fte })}</span>
      )}
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{periodOf(row.validFrom, row.validTo)}</span>
        <StatusPill tone={STATE_TONE[row.state]}>{text.assignment.states[row.state]}</StatusPill>
      </span>
    </button>
  );
}

interface MonthContext {
  readonly currency: string;
  readonly month: string;
  readonly monthKey: string;
  readonly plannedHours: number;
  readonly today: string;
}

function PreviewStrip({
  components,
  terms,
  assignment,
  ctx,
}: {
  readonly components: readonly ResolvedComponent[];
  readonly terms: PayTerms;
  readonly assignment: Assignment;
  readonly ctx: MonthContext;
}) {
  const preview = monthPreview(components, terms.adjustments, {
    month: ctx.monthKey,
    plannedHours: ctx.plannedHours,
    share: assignment.share,
  });
  const sign = preview.adjustments >= 0 ? '+' : '';
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-muted px-2.5 py-1.5 text-xs tabular-nums">
      <span className="font-medium">
        {fill(text.preview.heading, { month: ctx.month })}
        <InfoTip text={text.preview.hint} />
      </span>
      <span className="text-muted-foreground">
        {fill(text.preview.hours, { n: ctx.plannedHours })}
      </span>
      <span>
        {text.preview.base} {money(preview.base, ctx.currency)}
      </span>
      <span>
        {text.preview.level} {money(preview.levelSupplement, ctx.currency)}
      </span>
      <span>
        {text.preview.adjustments} {sign}
        {money(preview.adjustments, ctx.currency)}
      </span>
      <span className="font-semibold">
        {text.preview.total} {money(preview.total, ctx.currency)}
      </span>
    </p>
  );
}

function adjustmentKind(kind: string): string {
  const kinds: Record<string, string> = text.adjustments.kinds;
  return kinds[kind] ?? kind;
}

function AdjustmentsList({
  terms,
  currency,
}: {
  readonly terms: PayTerms;
  readonly currency: string;
}) {
  if (terms.adjustments.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {terms.adjustments.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{adjustmentKind(row.kind)}</span>
          <span className="tabular-nums">{money(row.amount, currency)}</span>
          <span className="text-xs text-muted-foreground">
            {row.period} · {row.reason} · {row.author}
          </span>
          <StatusPill tone={row.status === TermStatus.DRAFT ? 'accent' : 'success'}>
            {row.status === TermStatus.DRAFT ? text.components.draft : text.components.approved}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

function HistoryList({
  terms,
  defaultOpen,
}: {
  readonly terms: PayTerms;
  readonly defaultOpen: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1.5 rounded-md text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
          <HistoryIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {text.history.heading}
          <Muted className="text-xs tabular-nums">({terms.history.length})</Muted>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-1.5 flex flex-col gap-1 border-l border-border pl-3 text-sm">
          {terms.history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular-nums text-muted-foreground">{formatDate(entry.at)}</span>
              <span className="[overflow-wrap:anywhere]">{entry.text}</span>
              <Muted className="text-xs">{entry.author}</Muted>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

type Editor =
  | { readonly kind: 'term'; readonly row: ResolvedComponent; readonly mode: EditMode }
  | { readonly kind: 'adjustment' }
  | { readonly kind: 'transfer' }
  | null;

function initialEditor(demo: PayTermsDemo, components: readonly ResolvedComponent[]): Editor {
  const wanted = demo.editor;
  if (wanted) {
    const row = components.find((item) => item.key === wanted.key);
    if (row) return { kind: 'term', row, mode: wanted.mode };
  }
  if (demo.adjustment) return { kind: 'adjustment' };
  if (demo.transfer) return { kind: 'transfer' };
  return null;
}

function SectionHeader({
  employment,
  editable,
  onAdd,
}: {
  readonly employment: Employment;
  readonly editable: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 id="profile-pay-terms" className="text-lg font-semibold">
        {text.title} <InfoTip text={text.hint} />
      </h2>
      <Muted className="text-xs">
        {employment.employer} · {text.employment.contract} {employment.contract} ·{' '}
        {employment.currency}
      </Muted>
      {editable ? (
        <Button type="button" size="xs" variant="outline" className="ml-auto" onClick={onAdd}>
          <PlusIcon aria-hidden="true" />
          {text.assignment.add}
        </Button>
      ) : (
        <StatusPill tone="neutral">{text.access.readonly}</StatusPill>
      )}
    </div>
  );
}

function ComponentsHeader({
  assignment,
  editable,
  ctx,
  levelOpen,
  onEditor,
  onNotify,
}: {
  readonly assignment: Assignment;
  readonly editable: boolean;
  readonly ctx: MonthContext;
  readonly levelOpen: boolean;
  readonly onEditor: (editor: Editor) => void;
  readonly onNotify: (message: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-medium">{text.components.heading}</h3>
      <Muted className="text-xs">
        {assignment.position} · {assignment.level?.name ?? text.assignment.noLevel}
      </Muted>
      {editable && (
        <span className="ml-auto flex items-center gap-1">
          <LevelChangePopover
            assignment={assignment}
            plannedHours={ctx.plannedHours}
            currency={ctx.currency}
            today={ctx.today}
            defaultOpen={levelOpen}
            onSubmit={(level) => onNotify(`${text.level.title}: ${level.name}`)}
          />
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onEditor({ kind: 'transfer' })}
          >
            {text.assignment.transfer}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onEditor({ kind: 'adjustment' })}
          >
            {text.adjustments.add}
          </Button>
        </span>
      )}
    </div>
  );
}

function Editors({
  editor,
  assignment,
  components,
  ctx,
  transferTargets,
  onClose,
  onDone,
}: {
  readonly editor: Editor;
  readonly assignment: Assignment;
  readonly components: readonly ResolvedComponent[];
  readonly ctx: MonthContext;
  readonly transferTargets: readonly TransferTarget[];
  readonly onClose: () => void;
  readonly onDone: (message: string) => void;
}) {
  const monthBase = components.find((row) => row.key === ComponentKey.BASE_SALARY)?.applied ?? 0;
  if (editor?.kind === 'term') {
    return (
      <TermEditor
        row={editor.row}
        mode={editor.mode}
        currency={ctx.currency}
        monthBase={monthBase}
        today={ctx.today}
        onClose={onClose}
        onSubmit={() => onDone(text.editor.submit)}
      />
    );
  }
  if (editor?.kind === 'adjustment') {
    return (
      <AdjustmentDialog
        monthKey={ctx.monthKey}
        currency={ctx.currency}
        onClose={onClose}
        onSubmit={() => onDone(text.adjustments.save)}
      />
    );
  }
  if (editor?.kind === 'transfer') {
    return (
      <TransferDialog
        assignment={assignment}
        components={components}
        targets={transferTargets}
        currency={ctx.currency}
        today={ctx.today}
        onClose={onClose}
        onSubmit={() => onDone(text.transfer.submit)}
      />
    );
  }
  return null;
}

interface Props {
  readonly terms: PayTerms;
  readonly access: PayTermsAccess;
  readonly month: string;
  readonly monthKey: string;
  readonly plannedHours: number;
  readonly today: string;
  readonly transferTargets: readonly TransferTarget[];
  readonly demo?: PayTermsDemo;
  readonly onNotify: (message: string) => void;
}

interface BodyProps {
  readonly terms: PayTerms;
  readonly selected: Assignment;
  readonly components: readonly ResolvedComponent[];
  readonly ctx: MonthContext;
  readonly editable: boolean;
  readonly showAmounts: boolean;
  readonly demo: PayTermsDemo;
  readonly onEditor: (editor: Editor) => void;
  readonly onNotify: (message: string) => void;
}

function SelectedAssignment(props: BodyProps) {
  const { terms, selected, components, ctx, editable, showAmounts, demo, onEditor, onNotify } =
    props;
  return (
    <>
      {selected.state === AssignmentState.ACTIVE && (
        <ComponentsHeader
          assignment={selected}
          editable={editable}
          ctx={ctx}
          levelOpen={demo.level ?? false}
          onEditor={onEditor}
          onNotify={onNotify}
        />
      )}
      {!showAmounts && <Muted className="text-xs">{text.access.namesOnly}</Muted>}
      {components.length > 0 && (
        <ComponentsTable
          rows={components}
          currency={ctx.currency}
          editable={editable}
          showAmounts={showAmounts}
          pathOpenFor={demo.pathFor}
          actions={{
            onChange: (row) => onEditor({ kind: 'term', row, mode: TermMode.REPLACE }),
            onAdd: (row) => onEditor({ kind: 'term', row, mode: TermMode.ADD }),
            onRevert: (row) =>
              onNotify(`${text.components.revert}: ${text.components.keys[row.key]}`),
          }}
        />
      )}
      {showAmounts && components.length > 0 && (
        <PreviewStrip components={components} terms={terms} assignment={selected} ctx={ctx} />
      )}
      {showAmounts && <AdjustmentsList terms={terms} currency={ctx.currency} />}
    </>
  );
}

function defaultAssignment(terms: PayTerms): Assignment | undefined {
  return (
    terms.assignments.find((row) => row.state === AssignmentState.ACTIVE) ?? terms.assignments[0]
  );
}

/**
 * «Должности и оплата»: the person's employments and assignments, then the selected assignment's
 * components with their sources, the month preview, one-time corrections and the history. Every
 * change here is dated, reasoned and approved; nothing is a bare edit of an amount (UI-07/08).
 */
export function PayTermsSection(props: Props) {
  const { terms, access, transferTargets, demo = {}, onNotify } = props;
  const [selectedId, setSelectedId] = useState(defaultAssignment(terms)?.id ?? '');
  const selected =
    terms.assignments.find((row) => row.id === selectedId) ?? defaultAssignment(terms);
  const components = selected ? (terms.components.get(selected.id) ?? []) : [];
  const [editor, setEditor] = useState<Editor>(() => initialEditor(demo, components));
  const employment = terms.employments.find((row) => row.id === selected?.employmentId);
  if (!selected || !employment) return null;
  const ctx: MonthContext = {
    currency: employment.currency,
    month: props.month,
    monthKey: props.monthKey,
    plannedHours: props.plannedHours,
    today: props.today,
  };
  const editable = access === 'WRITE';
  return (
    <section
      className="min-w-0 space-y-3 border-t pt-4 lg:col-span-2"
      aria-labelledby="profile-pay-terms"
    >
      <SectionHeader
        employment={employment}
        editable={editable}
        onAdd={() => onNotify(text.assignment.add)}
      />
      <div className="flex flex-col gap-1">
        {terms.assignments.map((row) => (
          <AssignmentRow
            key={row.id}
            row={row}
            selected={row.id === selected.id}
            onSelect={() => setSelectedId(row.id)}
          />
        ))}
      </div>
      <SelectedAssignment
        terms={terms}
        selected={selected}
        components={components}
        ctx={ctx}
        editable={editable}
        showAmounts={access !== 'NAMES'}
        demo={demo}
        onEditor={setEditor}
        onNotify={onNotify}
      />
      <HistoryList terms={terms} defaultOpen={demo.historyOpen ?? false} />
      <Editors
        editor={editor}
        assignment={selected}
        components={components}
        ctx={ctx}
        transferTargets={transferTargets}
        onClose={() => setEditor(null)}
        onDone={(message) => {
          onNotify(message);
          setEditor(null);
        }}
      />
    </section>
  );
}
