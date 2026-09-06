import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdjustmentView,
  BonusPeriodView,
  OrgSnapshot,
  ShiftScoreView,
} from '@vakhta/contracts';
import { BONUS_CRITERIA, type BonusCriterion } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ClipboardCheckIcon,
  CoinsIcon,
  DownloadIcon,
  EyeIcon,
  LockIcon,
  LockOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AddDialog } from '@/components/app/add-dialog';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { MonthField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { isBlank } from '@/lib/forms';
import { usePersistentState } from '@/lib/persistent-state';
import { notifySuccess } from '@/lib/toast';
import { bonusApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const b = all.admin.bonus;
const hints = all.ui.hints;
type ScoreStatus = ShiftScoreView['status'];
const SCORE_TONE: Record<ScoreStatus, Tone> = {
  PRELIMINARY: 'neutral',
  PENDING: 'warning',
  MANUAL_REVIEW: 'warning',
  APPEALED: 'info',
  CONFIRMED: 'success',
  NOT_EVALUATED: 'neutral',
};
const ADJUSTMENT_TONE: Record<AdjustmentView['status'], Tone> = {
  PENDING_SECOND: 'warning',
  APPLIED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};
type PeriodEmployee = BonusPeriodView['employees'][number];
type PendingAdjustment = BonusPeriodView['pendingAdjustments'][number];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * "Bonus" (spec 7, 9.1): the month at a glance, a rating of the best employees, and one card per
 * employee where the master adds or takes points, finishes manual reviews and edits or deletes
 * adjustments. The period close confirms the points; HR then sets the base amounts.
 */
export function BonusPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = usePersistentState('bonus.siteId', '');
  const [month, setMonth] = usePersistentState('bonus.month', currentMonth);
  const [period, setPeriod] = useState<BonusPeriodView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openEmployee, setOpenEmployee] = usePersistentState<string | null>(
    'bonus.openEmployee',
    null,
  );
  const [points, setPoints] = useState<{
    employee: PeriodEmployee;
    score?: ShiftScoreView;
    kind?: 'BONUS' | 'PENALTY';
  } | null>(null);
  const [editing, setEditing] = useState<{
    score: ShiftScoreView;
    adjustment: AdjustmentView;
  } | null>(null);
  const [review, setReview] = useState<ShiftScoreView | null>(null);
  const [base, setBase] = useState<Record<string, string>>({});
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    orgApi
      .snapshot()
      .then((snapshot) => {
        setOrg(snapshot);
        setSiteId((cur) =>
          snapshot.sites.some((site) => site.id === cur) ? cur : (snapshot.sites[0]?.id ?? ''),
        );
      })
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    if (!siteId) return;
    setPeriod(await bonusApi.period(siteId, month));
  }, [siteId, month]);

  useEffect(() => {
    reload().catch((e: unknown) => setError(describeError(e)));
  }, [reload]);

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) notifySuccess(done);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod() {
    const text = await confirm({
      title: b.closePeriod,
      description: b.closeConfirm,
      confirmLabel: b.closePeriod,
      commentLabel: b.comment,
      commentRequired: true,
      destructive: true,
    });
    if (!text) return;
    void run(async () => {
      await bonusApi.close(siteId, month, text);
      await reload();
    }, b.closed);
  }

  async function reopenPeriod() {
    if (!period?.id) return;
    const text = await confirm({
      title: b.reopenPeriod,
      description: b.reopenConfirm,
      confirmLabel: b.reopenPeriod,
      commentLabel: b.comment,
      commentRequired: true,
    });
    if (!text) return;
    const periodId = period.id;
    void run(async () => {
      await bonusApi.reopen(periodId, text);
      await reload();
    }, b.reopened);
  }

  async function second(a: PendingAdjustment, decision: 'APPROVED' | 'REJECTED') {
    const text = await confirm({
      title: `${decision === 'APPROVED' ? b.approve : b.reject}: ${a.employeeName}`,
      confirmLabel: decision === 'APPROVED' ? b.approve : b.reject,
      commentLabel: b.comment,
      commentRequired: true,
      destructive: decision === 'REJECTED',
    });
    if (!text) return;
    void run(async () => {
      await bonusApi.second(a.id, { decision, comment: text });
      await reload();
    }, b.adjusted);
  }

  async function deleteAdjustment(a: AdjustmentView) {
    const reason = await confirm({
      title: b.deleteAdjustment,
      description: format(b.deleteConfirm, { delta: signed(a.delta) }),
      confirmLabel: b.deleteAdjustment,
      commentLabel: b.comment,
      commentRequired: true,
      destructive: true,
    });
    if (!reason) return;
    void run(async () => {
      await bonusApi.cancelAdjustment(a.id, reason);
      await reload();
    }, b.deleted);
  }

  const adjustmentReasons =
    org?.reasonCodes.filter((r) => r.kind === 'ADJUSTMENT' && r.isActive) ?? [];
  const closed = period?.status === 'CLOSED';
  const employees = period?.employees ?? [];
  const rating = useMemo(
    () =>
      [...employees]
        .filter((e) => e.sMonth !== null)
        .sort((x, y) => (y.sMonth ?? 0) - (x.sMonth ?? 0)),
    [employees],
  );
  const rankOf = (id: string) => {
    const i = rating.findIndex((e) => e.employeeId === id);
    return i >= 0 ? i + 1 : null;
  };
  const onReview = employees.reduce(
    (n, e) => n + e.scores.filter((s) => s.status === 'MANUAL_REVIEW').length,
    0,
  );
  const shiftsTotal = employees.reduce((n, e) => n + e.shifts, 0);
  const evaluatedTotal = employees.reduce((n, e) => n + e.evaluatedShifts, 0);

  const employeeColumns: Column<PeriodEmployee>[] = [
    {
      key: 'rank',
      header: b.rank,
      align: 'right',
      cell: (e) => <span className="tabular-nums">{rankOf(e.employeeId) ?? '—'}</span>,
      sortValue: (e) => rankOf(e.employeeId) ?? 999,
    },
    {
      key: 'employee',
      header: b.employee,
      cell: (e) => (
        <span>
          {e.employeeName} <Muted>{e.personnelNumber}</Muted>
        </span>
      ),
      sortValue: (e) => e.employeeName,
    },
    { key: 'shifts', header: b.shifts, align: 'right', cell: (e) => e.shifts },
    { key: 'evaluated', header: b.evaluated, align: 'right', cell: (e) => e.evaluatedShifts },
    {
      key: 'pending',
      header: b.pending,
      align: 'right',
      cell: (e) =>
        e.pendingShifts > 0 ? <StatusPill tone="warning">{e.pendingShifts}</StatusPill> : 0,
    },
    {
      key: 'sMonth',
      header: (
        <span className="inline-flex items-center gap-1">
          {b.sMonth}
          <InfoTip text={hints.bonusSMonth} />
        </span>
      ),
      align: 'right',
      cell: (e) => <span className="font-medium tabular-nums">{e.sMonth ?? '—'}</span>,
      sortValue: (e) => e.sMonth ?? -1,
    },
    {
      key: 'base',
      header: (
        <span className="inline-flex items-center gap-1">
          {b.base}
          <InfoTip text={hints.bonusBase} />
        </span>
      ),
      align: 'right',
      cell: (e) =>
        closed ? (
          <Input
            type="number"
            min={0}
            className="ml-auto w-32 text-right"
            value={base[e.employeeId] ?? e.baseAmount ?? ''}
            onChange={(ev) => setBase((s) => ({ ...s, [e.employeeId]: ev.target.value }))}
            aria-label={`${b.base} ${e.employeeName}`}
          />
        ) : (
          <span className="tabular-nums">{e.baseAmount ?? '—'}</span>
        ),
    },
    {
      key: 'amount',
      header: b.amount,
      align: 'right',
      cell: (e) => <span className="tabular-nums">{e.bonusAmount ?? '—'}</span>,
    },
  ];

  const pendingColumns: Column<PendingAdjustment>[] = [
    { key: 'employee', header: b.employee, cell: (a) => a.employeeName },
    { key: 'date', header: b.shift, cell: (a) => a.businessDate },
    {
      key: 'criterion',
      header: b.criterion,
      cell: (a) => (a.criterion ? all.bonus.criteria[a.criterion] : b.wholeScore),
    },
    {
      key: 'delta',
      header: b.delta,
      align: 'right',
      cell: (a) => <span className="tabular-nums">{signed(a.delta)}</span>,
    },
    { key: 'reason', header: b.reasonCode, cell: (a) => `${a.reasonCode} · ${a.comment}` },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void second(a, 'APPROVED')}
          >
            {b.approve}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void second(a, 'REJECTED')}
          >
            {b.reject}
          </Button>
        </div>
      ),
    },
  ];

  const chartConfig: ChartConfig = { sMonth: { label: b.sMonth, color: 'var(--chart-1)' } };
  const chartData = rating
    .slice(0, 10)
    .map((e) => ({ name: e.employeeName, sMonth: e.sMonth ?? 0 }));

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <SelectField
          label={b.site}
          value={siteId}
          onChange={setSiteId}
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <MonthField label={b.month} value={month} onChange={setMonth} className="w-48" />
        <div className="ml-auto flex items-center gap-2">
          {period && period.status !== 'CLOSED' && (
            <>
              <Button
                type="button"
                disabled={busy || period.employees.length === 0}
                onClick={() => void closePeriod()}
              >
                {b.closePeriod}
              </Button>
              <InfoTip text={hints.bonusClose} />
            </>
          )}
          {period?.id && closed && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void reopenPeriod()}
              >
                <LockOpenIcon aria-hidden="true" />
                {b.reopenPeriod}
              </Button>
              <Button asChild variant="outline">
                <a href={bonusApi.exportUrl(period.id)} target="_blank" rel="noreferrer">
                  <DownloadIcon aria-hidden="true" />
                  {b.exportCsv}
                </a>
              </Button>
            </>
          )}
        </div>
      </Toolbar>
      <Feedback error={error} />

      {period && closed && (
        <Alert>
          <LockIcon aria-hidden="true" />
          <AlertTitle>{b.periodClosedTitle}</AlertTitle>
          <AlertDescription>
            <p>{b.periodClosedHint}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void reopenPeriod()}
            >
              <LockOpenIcon aria-hidden="true" />
              {b.reopenPeriod}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {period && !closed && <HowItWorks />}

      {period && (
        <Section
          title={b.summary}
          description={b.periodHelp[period.status]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={closed ? 'success' : 'info'}>
                {b.period}: {b.periodStatuses[period.status]}
              </StatusPill>
              {period.ruleLabel && (
                <Muted>
                  {b.ruleVersion}: {period.ruleLabel}
                </Muted>
              )}
            </div>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryTile label={b.employeesCount} value={employees.length} />
            <SummaryTile label={b.shifts} value={shiftsTotal} />
            <SummaryTile label={b.evaluated} value={evaluatedTotal} />
            <SummaryTile
              label={b.onReview}
              value={onReview}
              tone={onReview > 0 ? 'warning' : undefined}
              hint={hints.bonusReview}
            />
            <SummaryTile
              label={b.secondPending}
              value={period.pendingAdjustments.length}
              tone={period.pendingAdjustments.length > 0 ? 'warning' : undefined}
              hint={hints.bonusSecond}
            />
          </dl>
        </Section>
      )}

      {period && (
        <Section
          title={b.leaderboard}
          hint={hints.bonusLeaderboard}
          className="print:break-inside-avoid"
        >
          {rating.length === 0 ? (
            <Muted>{b.noLeaderboard}</Muted>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={48}
                    angle={-20}
                    textAnchor="end"
                    fontSize={11}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    fontSize={11}
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="sMonth" fill="var(--color-sMonth)" radius={4} />
                </BarChart>
              </ChartContainer>
              <ol className="flex flex-col gap-1 text-sm">
                {rating.slice(0, 10).map((e, i) => (
                  <li
                    key={e.employeeId}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5"
                  >
                    <span className="w-6 text-right font-semibold tabular-nums">{i + 1}</span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      onClick={() => setOpenEmployee(e.employeeId)}
                    >
                      {e.employeeName}
                    </button>
                    <span className="font-medium tabular-nums">{e.sMonth}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>
      )}

      {period && period.pendingAdjustments.length > 0 && (
        <Section title={b.secondQueue} hint={hints.bonusSecond}>
          <DataTable
            columns={pendingColumns}
            rows={period.pendingAdjustments}
            rowKey={(a) => a.id}
            empty={b.empty}
          />
        </Section>
      )}

      <DataTable
        columns={employeeColumns}
        rows={employees}
        rowKey={(e) => e.employeeId}
        empty={b.empty}
        storageKey="bonus.employees"
        searchText={(e) => `${e.employeeName} ${e.personnelNumber}`}
        activeKey={openEmployee}
        onRowClick={(e) => setOpenEmployee(openEmployee === e.employeeId ? null : e.employeeId)}
        expanded={(e) =>
          e.employeeId === openEmployee ? (
            <EmployeeDetail
              employee={e}
              closed={closed}
              busy={busy}
              onClose={() => setOpenEmployee(null)}
              onPoints={(score, kind) => setPoints({ employee: e, score, kind })}
              onReview={setReview}
              onEdit={(score, adjustment) => setEditing({ score, adjustment })}
              onDelete={(a) => void deleteAdjustment(a)}
              onRecompute={(score) =>
                void run(() => bonusApi.recompute(score.shiftSessionId).then(reload), b.recomputed)
              }
            />
          ) : null
        }
        rowActions={(e) => [
          {
            key: 'detail',
            label: b.detail,
            icon: EyeIcon,
            onSelect: () => setOpenEmployee(e.employeeId),
          },
          {
            key: 'points',
            label: b.addPoints,
            icon: CoinsIcon,
            disabled: busy || closed || e.scores.length === 0,
            onSelect: () => setPoints({ employee: e }),
          },
        ]}
      />

      {period?.id && closed && (
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const items = Object.entries(base)
                  .filter(([, v]) => v !== '')
                  .map(([employeeId, v]) => ({ employeeId, baseAmount: Number(v) }));
                if (items.length === 0) return;
                await bonusApi.setBase(period.id!, { items });
                await reload();
              }, b.baseSaved)
            }
          >
            {b.setBase}
          </Button>
        </div>
      )}

      {points && (
        <PointsDialog
          key={`${points.employee.employeeId}:${points.score?.id ?? 'any'}`}
          employee={points.employee}
          initialKind={points.kind ?? 'BONUS'}
          score={points.score ?? null}
          reasons={adjustmentReasons}
          onClose={() => setPoints(null)}
          onSaved={async (view) => {
            setPoints(null);
            notifySuccess(
              view.adjustments.some((a) => a.status === 'PENDING_SECOND')
                ? `${b.adjusted} ${b.needsSecond}`
                : b.adjusted,
            );
            await reload();
          }}
        />
      )}
      {editing && (
        <EditAdjustmentDialog
          key={editing.adjustment.id}
          adjustment={editing.adjustment}
          reasons={adjustmentReasons}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            notifySuccess(b.adjusted);
            await reload();
          }}
        />
      )}
      {review && (
        <ReviewDialog
          key={review.id}
          score={review}
          onClose={() => setReview(null)}
          onSaved={async () => {
            setReview(null);
            notifySuccess(b.reviewed);
            await reload();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
  readonly hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && <InfoTip text={hint} />}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">
        {tone ? <StatusPill tone={tone}>{value}</StatusPill> : value}
      </dd>
    </div>
  );
}

/**
 * The employee's month inside the table: a header with the totals and the two point actions, then
 * one card per shift in a responsive grid, so the page width is used instead of a side panel.
 */
function EmployeeDetail({
  employee,
  closed,
  busy,
  onClose,
  onPoints,
  onReview,
  onEdit,
  onDelete,
  onRecompute,
}: {
  readonly employee: PeriodEmployee;
  readonly closed: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onPoints: (score: ShiftScoreView | undefined, kind: 'BONUS' | 'PENALTY') => void;
  readonly onReview: (score: ShiftScoreView) => void;
  readonly onEdit: (score: ShiftScoreView, adjustment: AdjustmentView) => void;
  readonly onDelete: (adjustment: AdjustmentView) => void;
  readonly onRecompute: (score: ShiftScoreView) => void;
}) {
  return (
    <div className="flex flex-col gap-3 py-1" data-testid="employee-detail">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">
            {employee.employeeName} <Muted>{employee.personnelNumber}</Muted>
          </span>
          <Muted className="text-xs">
            {b.sMonth}: {employee.sMonth ?? '—'} · {b.shifts}: {employee.shifts} · {b.evaluated}:{' '}
            {employee.evaluatedShifts}
          </Muted>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {employee.scores.length > 0 &&
            (closed ? (
              <Muted className="flex items-center gap-1">
                <LockIcon className="size-4" aria-hidden="true" />
                {b.closedActions}
              </Muted>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onPoints(undefined, 'BONUS')}
                  disabled={busy}
                >
                  <ThumbsUpIcon aria-hidden="true" />
                  {b.addBonus}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onPoints(undefined, 'PENALTY')}
                  disabled={busy}
                >
                  <ThumbsDownIcon aria-hidden="true" />
                  {b.takePoints}
                </Button>
              </>
            ))}
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            <XIcon aria-hidden="true" />
            {all.ui.common.close}
          </Button>
        </div>
      </div>
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        {b.detailTitle}
        <InfoTip text={hints.bonusStatus} />
      </h3>
      {employee.scores.length === 0 ? (
        <Muted>{b.empty}</Muted>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {employee.scores.map((s) => (
            <ShiftCard
              key={s.id}
              score={s}
              closed={closed}
              busy={busy}
              onPoints={(kind) => onPoints(s, kind)}
              onReview={() => onReview(s)}
              onEdit={(a) => onEdit(s, a)}
              onDelete={onDelete}
              onRecompute={() => onRecompute(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Numbered guide for administrators: what the scores are and which button does what. */
function HowItWorks({ compact = false }: { readonly compact?: boolean }) {
  const [openGuide, setOpenGuide] = usePersistentState('bonus.guideOpen', !compact);
  return (
    <div className={compact ? 'rounded-lg border bg-muted/40 p-3' : 'rounded-lg border p-4'}>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-semibold"
        aria-expanded={openGuide}
        onClick={() => setOpenGuide((v) => !v)}
      >
        <ClipboardCheckIcon className="size-4" aria-hidden="true" />
        {b.howItWorks}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {openGuide ? all.ui.common.hide : all.ui.common.details}
        </span>
      </button>
      {openGuide && (
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {b.howSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One shift of the employee: status with its meaning, an explicit action row, the adjustments. */
function ShiftCard({
  score,
  closed,
  busy,
  onPoints,
  onReview,
  onEdit,
  onDelete,
  onRecompute,
}: {
  readonly score: ShiftScoreView;
  readonly closed: boolean;
  readonly busy: boolean;
  readonly onPoints: (kind: 'BONUS' | 'PENALTY') => void;
  readonly onReview: () => void;
  readonly onEdit: (a: AdjustmentView) => void;
  readonly onDelete: (a: AdjustmentView) => void;
  readonly onRecompute: () => void;
}) {
  const [showCriteria, setShowCriteria] = useState(false);
  const missing = score.criteria
    .filter((c) => c.status === 'not_applicable')
    .map((c) => all.bonus.criteria[c.criterion]);
  const live = score.adjustments.filter((a) => a.status !== 'CANCELLED' && a.status !== 'REJECTED');
  const history = score.adjustments.filter(
    (a) => a.status === 'CANCELLED' || a.status === 'REJECTED',
  );
  const excluded = score.status === 'NOT_EVALUATED';
  const canTakePoints = !closed && !excluded && score.status !== 'MANUAL_REVIEW';
  const criteriaColumns: Column<ShiftScoreView['criteria'][number]>[] = [
    { key: 'criterion', header: b.criterion, cell: (c) => all.bonus.criteria[c.criterion] },
    {
      key: 'points',
      header: b.points,
      cell: (c) => (
        <span className="tabular-nums">
          {c.status === 'not_applicable'
            ? all.bonus.criterionStatuses.not_applicable
            : `${c.earnedPoints}/${c.maxPoints}`}{' '}
          <Muted>{all.bonus.criterionStatuses[c.status]}</Muted>
        </span>
      ),
    },
    { key: 'basis', header: b.basis, cell: (c) => <Muted>{c.basis.join(', ')}</Muted> },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">{score.businessDate}</span>
        <StatusPill tone={SCORE_TONE[score.status]}>{all.bonus.statuses[score.status]}</StatusPill>
        {score.reviewDecision === 'SCORE' && score.manualScore !== null && (
          <StatusPill tone="info">
            {format(b.reviewedBadge, { score: score.manualScore })}
          </StatusPill>
        )}
        <span className="ml-auto text-lg font-semibold tabular-nums">
          {score.score ?? '—'}
          <Muted className="text-sm font-normal"> / 100</Muted>
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {b.statusHelp[score.status]}
        {excluded && score.excludedReason ? ` ${score.excludedReason}` : ''}
      </p>
      {score.status === 'MANUAL_REVIEW' && (
        <Alert>
          <ClipboardCheckIcon aria-hidden="true" />
          <AlertTitle>{b.whatToDo}</AlertTitle>
          <AlertDescription>
            <p>
              {format(b.reviewReason, {
                applicable: score.applicableMax,
                missing: missing.join(', ') || '—',
              })}
            </p>
            <ol className="flex list-decimal flex-col gap-0.5 pl-5">
              {b.reviewSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </AlertDescription>
        </Alert>
      )}
      {closed ? (
        <Muted className="flex items-center gap-1">
          <LockIcon className="size-4" aria-hidden="true" />
          {b.closedActions}
        </Muted>
      ) : (
        <div className="flex flex-wrap gap-2">
          {score.status === 'MANUAL_REVIEW' && (
            <Button type="button" size="sm" onClick={onReview} disabled={busy}>
              <ClipboardCheckIcon aria-hidden="true" />
              {b.finishReview}
            </Button>
          )}
          {canTakePoints && (
            <>
              <Button
                type="button"
                size="sm"
                variant={score.reviewDecision === null ? 'default' : 'secondary'}
                onClick={() => onPoints('BONUS')}
                disabled={busy}
              >
                <ThumbsUpIcon aria-hidden="true" />
                {b.addBonus}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPoints('PENALTY')}
                disabled={busy}
              >
                <ThumbsDownIcon aria-hidden="true" />
                {b.takePoints}
              </Button>
            </>
          )}
          {score.reviewDecision !== null && (
            <Button type="button" size="sm" variant="outline" onClick={onReview} disabled={busy}>
              <Undo2Icon aria-hidden="true" />
              {excluded ? b.restoreShift : b.changeReview}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowCriteria((v) => !v)}>
          <EyeIcon aria-hidden="true" />
          {b.detail}
        </Button>
        {!closed && (
          <Button type="button" size="sm" variant="ghost" onClick={onRecompute} disabled={busy}>
            <RefreshCwIcon aria-hidden="true" />
            {b.recompute}
          </Button>
        )}
      </div>
      {showCriteria && (
        <DataTable
          columns={criteriaColumns}
          rows={score.criteria}
          rowKey={(c) => c.criterion}
          empty={b.empty}
          pageSize={20}
          rowClassName={(c) =>
            c.status === 'missed' ? 'bg-red-50/60 dark:bg-red-950/30' : undefined
          }
        />
      )}
      {(live.length > 0 || history.length > 0) && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{b.adjustmentsTitle}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {[...live, ...history].map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1"
              >
                <span
                  className={`font-semibold tabular-nums ${a.delta > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
                >
                  {signed(a.delta)}
                </span>
                <span className="min-w-0 flex-1">
                  {a.criterion ? all.bonus.criteria[a.criterion] : b.wholeScore} · {a.reasonCode} ·{' '}
                  <Muted>{a.comment}</Muted>
                </span>
                <StatusPill tone={ADJUSTMENT_TONE[a.status]}>
                  {b.adjustmentStatuses[a.status]}
                </StatusPill>
                {!closed && (a.status === 'APPLIED' || a.status === 'PENDING_SECOND') && (
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`${b.editAdjustment} ${signed(a.delta)}`}
                      onClick={() => onEdit(a)}
                      disabled={busy}
                    >
                      <PencilIcon aria-hidden="true" />
                      {b.editAdjustment}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={`${b.deleteAdjustment} ${signed(a.delta)}`}
                      onClick={() => onDelete(a)}
                      disabled={busy}
                    >
                      <Trash2Icon aria-hidden="true" />
                      {b.deleteAdjustment}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Reason = OrgSnapshot['reasonCodes'][number];

/** Add or take points: the whole score by default, one criterion under "Advanced". */
function PointsDialog({
  employee,
  score,
  initialKind,
  reasons,
  onClose,
  onSaved,
}: {
  readonly employee: PeriodEmployee;
  readonly score: ShiftScoreView | null;
  readonly initialKind: 'BONUS' | 'PENALTY';
  readonly reasons: readonly Reason[];
  readonly onClose: () => void;
  readonly onSaved: (view: ShiftScoreView) => Promise<void>;
}) {
  const candidates = employee.scores.filter(
    (s) => s.status !== 'NOT_EVALUATED' && s.status !== 'CONFIRMED',
  );
  const [scoreId, setScoreId] = useState(score?.id ?? candidates[candidates.length - 1]?.id ?? '');
  const [kind, setKind] = useState<'BONUS' | 'PENALTY'>(initialKind);
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState(reasons[0]?.code ?? '');
  const [comment, setComment] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [criterion, setCriterion] = useState<BonusCriterion | ''>('');
  const { busy, error, run } = useAction();
  const n = Number(amount);
  const valid =
    scoreId !== '' &&
    Number.isInteger(n) &&
    n > 0 &&
    n <= 100 &&
    reasonCode !== '' &&
    comment.trim().length >= 3;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!valid) return;
    void run(async () => {
      const view = await bonusApi.adjust(scoreId, {
        delta: kind === 'BONUS' ? n : -n,
        reasonCode,
        comment: comment.trim(),
        ...(advanced && criterion ? { criterion } : {}),
      });
      await onSaved(view);
    });
  }

  return (
    <AddDialog
      title={`${b.pointsDialog}: ${employee.employeeName}`}
      hint={hints.bonusPoints}
      hideTrigger
      open
      onOpenChange={(next) => !next && onClose()}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <SelectField
          label={b.shift}
          value={scoreId}
          onChange={setScoreId}
          options={candidates.map((s) => ({
            value: s.id,
            label: `${s.businessDate} · ${s.score ?? '—'} / 100 · ${all.bonus.statuses[s.status]}`,
          }))}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{b.pointsKind}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as 'BONUS' | 'PENALTY')}
            aria-label={b.pointsKind}
          >
            <ToggleGroupItem value="BONUS">{b.pointsKinds.BONUS}</ToggleGroupItem>
            <ToggleGroupItem value="PENALTY">{b.pointsKinds.PENALTY}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <FormField label={b.pointsAmount} className="w-40">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={100}
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              required
            />
          )}
        </FormField>
        <SelectField
          label={b.reasonCode}
          value={reasonCode}
          onChange={setReasonCode}
          placeholder="…"
          required
          options={reasons.map((r) => ({ value: r.code, label: r.label }))}
        />
        <FormField label={b.comment}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={comment}
              onChange={(ev) => setComment(ev.target.value)}
              minLength={3}
              required
            />
          )}
        </FormField>
        {kind === 'PENALTY' && <Muted>{b.secondThresholdHint}</Muted>}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setAdvanced((v) => !v)}
          >
            {b.advanced}
          </button>
          {advanced && (
            <SelectField
              label={b.criterionOptional}
              hint={hints.bonusAdjust}
              value={criterion}
              onChange={(v) => setCriterion(v as BonusCriterion | '')}
              placeholder={b.wholeScore}
              options={BONUS_CRITERIA.map((c) => ({ value: c, label: all.bonus.criteria[c] }))}
            />
          )}
        </div>
        <Feedback error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {all.ui.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {all.ui.common.save}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}

function EditAdjustmentDialog({
  adjustment,
  reasons,
  onClose,
  onSaved,
}: {
  readonly adjustment: AdjustmentView;
  readonly reasons: readonly Reason[];
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<'BONUS' | 'PENALTY'>(adjustment.delta > 0 ? 'BONUS' : 'PENALTY');
  const [amount, setAmount] = useState(String(Math.abs(adjustment.delta)));
  const [reasonCode, setReasonCode] = useState(adjustment.reasonCode);
  const [comment, setComment] = useState(adjustment.comment);
  const { busy, error, run } = useAction();
  const n = Number(amount);
  const delta = kind === 'BONUS' ? n : -n;
  const valid =
    Number.isInteger(n) && n > 0 && n <= 100 && reasonCode !== '' && comment.trim().length >= 3;
  const unchanged =
    delta === adjustment.delta &&
    reasonCode === adjustment.reasonCode &&
    comment.trim() === adjustment.comment;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!valid || unchanged) return;
    void run(async () => {
      await bonusApi.updateAdjustment(adjustment.id, {
        ...(delta !== adjustment.delta ? { delta } : {}),
        ...(reasonCode !== adjustment.reasonCode ? { reasonCode } : {}),
        ...(comment.trim() !== adjustment.comment ? { comment: comment.trim() } : {}),
      });
      await onSaved();
    });
  }

  return (
    <AddDialog
      title={`${b.editAdjustment}: ${signed(adjustment.delta)}`}
      hint={hints.bonusPoints}
      hideTrigger
      open
      onOpenChange={(next) => !next && onClose()}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{b.pointsKind}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as 'BONUS' | 'PENALTY')}
            aria-label={b.pointsKind}
          >
            <ToggleGroupItem value="BONUS">{b.pointsKinds.BONUS}</ToggleGroupItem>
            <ToggleGroupItem value="PENALTY">{b.pointsKinds.PENALTY}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <FormField label={b.pointsAmount} className="w-40">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={100}
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              required
            />
          )}
        </FormField>
        <SelectField
          label={b.reasonCode}
          value={reasonCode}
          onChange={setReasonCode}
          options={reasons.map((r) => ({ value: r.code, label: r.label }))}
        />
        <FormField label={b.comment}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={comment}
              onChange={(ev) => setComment(ev.target.value)}
              minLength={3}
              required
            />
          )}
        </FormField>
        <Feedback error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {all.ui.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !valid || unchanged}>
            {all.ui.common.save}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}

/** Finishes a manual review: a score for the shift or its exclusion from the month. */
function ReviewDialog({
  score,
  onClose,
  onSaved,
}: {
  readonly score: ShiftScoreView;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const suggested = score.manualScore ?? score.reviewSuggestedScore;
  const [decision, setDecision] = useState<'SCORE' | 'EXCLUDE'>(score.reviewDecision ?? 'SCORE');
  const [value, setValue] = useState(suggested === null ? '' : String(suggested));
  const [comment, setComment] = useState(score.reviewComment ?? '');
  const { busy, error, run } = useAction();
  const n = Number(value);
  const valid =
    comment.trim().length >= 3 &&
    (decision === 'EXCLUDE' || (Number.isInteger(n) && n >= 0 && n <= 100));
  const missing = score.criteria
    .filter((c) => c.status === 'not_applicable')
    .map((c) => all.bonus.criteria[c.criterion]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!valid) return;
    void run(async () => {
      await bonusApi.review(score.id, {
        decision,
        ...(decision === 'SCORE' ? { score: n } : {}),
        comment: comment.trim(),
      });
      await onSaved();
    });
  }

  return (
    <AddDialog
      title={`${b.reviewTitle}: ${score.businessDate}`}
      hint={hints.bonusReview}
      description={format(b.reviewExplain, {
        applicable: score.applicableMax,
        missing: missing.join(', ') || '—',
      })}
      hideTrigger
      open
      onOpenChange={(next) => !next && onClose()}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{b.reviewDecision}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={decision}
            onValueChange={(v) => v && setDecision(v as 'SCORE' | 'EXCLUDE')}
            aria-label={b.reviewDecision}
          >
            <ToggleGroupItem value="SCORE">{b.reviewDecisions.SCORE}</ToggleGroupItem>
            <ToggleGroupItem value="EXCLUDE">{b.reviewDecisions.EXCLUDE}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {decision === 'SCORE' && (
          <FormField
            label={b.reviewScore}
            hint={suggested !== null ? format(b.reviewSuggested, { score: suggested }) : undefined}
            className="w-40"
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={value}
                onChange={(ev) => setValue(ev.target.value)}
                required
              />
            )}
          </FormField>
        )}
        <FormField label={b.comment}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={comment}
              onChange={(ev) => setComment(ev.target.value)}
              minLength={3}
              required
            />
          )}
        </FormField>
        <Feedback error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {all.ui.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !valid || isBlank(comment)}>
            {b.finishReview}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}
