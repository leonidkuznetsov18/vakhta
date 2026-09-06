import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { BonusPeriodView, OrgSnapshot, ShiftScoreView } from '@vakhta/contracts';
import { BONUS_CRITERIA, type BonusCriterion } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
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
type PeriodEmployee = BonusPeriodView['employees'][number];
type PendingAdjustment = BonusPeriodView['pendingAdjustments'][number];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** "Bonus" (spec 9.1): preliminary and final calculation, breakdown, adjustments, period close. */
export function BonusPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<BonusPeriodView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<BonusCriterion>('DISCIPLINE_SEQUENCE');
  const [delta, setDelta] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');
  const [base, setBase] = useState<Record<string, string>>({});
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    orgApi
      .snapshot()
      .then((snapshot) => {
        setOrg(snapshot);
        if (snapshot.sites[0]) setSiteId(snapshot.sites[0].id);
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
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  function adjust(ev: FormEvent, score: ShiftScoreView) {
    ev.preventDefault();
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0 || !reasonCode || comment.trim().length < 3) return;
    void run(async () => {
      const updated = await bonusApi.adjust(score.id, {
        criterion,
        delta: d,
        reasonCode,
        comment: comment.trim(),
      });
      setNotice(
        updated.adjustments.some((a) => a.status === 'PENDING_SECOND')
          ? `${b.adjusted} ${b.needsSecond}`
          : b.adjusted,
      );
      setDelta('');
      setComment('');
      await reload();
    });
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

  const adjustmentReasons =
    org?.reasonCodes.filter((r) => r.kind === 'ADJUSTMENT' && r.isActive) ?? [];
  const closed = period?.status === 'CLOSED';

  const employeeColumns: Column<PeriodEmployee>[] = [
    {
      key: 'employee',
      header: b.employee,
      cell: (e) => (
        <span>
          {e.employeeName} <Muted>{e.personnelNumber}</Muted>
        </span>
      ),
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
    { key: 'date', header: b.period, cell: (a) => a.businessDate },
    { key: 'criterion', header: b.criterion, cell: (a) => all.bonus.criteria[a.criterion] },
    {
      key: 'delta',
      header: b.delta,
      align: 'right',
      cell: (a) => <span className="tabular-nums">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>,
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
        <FormField label={b.month} className="w-44">
          {(id) => (
            <Input
              id={id}
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          )}
        </FormField>
        {period && (
          <Muted className="pb-2">
            {b.period}: {period.status}
            {period.ruleLabel ? ` · ${b.ruleVersion}: ${period.ruleLabel}` : ''}
          </Muted>
        )}
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
            <Button asChild variant="outline">
              <a href={bonusApi.exportUrl(period.id)} target="_blank" rel="noreferrer">
                <DownloadIcon aria-hidden="true" />
                {b.exportCsv}
              </a>
            </Button>
          )}
        </div>
      </Toolbar>
      <Feedback error={error} notice={notice} />

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
        rows={period?.employees ?? []}
        rowKey={(e) => e.employeeId}
        empty={b.empty}
        expanded={(e) => (
          <ScoresTable
            scores={e.scores}
            openScore={openScore}
            onToggle={(id) => setOpenScore(openScore === id ? null : id)}
            busy={busy}
            onRecompute={(s) =>
              void run(() => bonusApi.recompute(s.shiftSessionId).then(reload), b.recomputed)
            }
            adjustForm={(s) =>
              s.status !== 'CONFIRMED' ? (
                <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => adjust(ev, s)}>
                  <SelectField
                    label={b.criterion}
                    value={criterion}
                    onChange={(v) => setCriterion(v as BonusCriterion)}
                    options={BONUS_CRITERIA.map((c) => ({
                      value: c,
                      label: all.bonus.criteria[c],
                    }))}
                    className="w-64"
                  />
                  <FormField label={b.delta} hint={hints.bonusAdjust} className="w-36">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={-100}
                        max={100}
                        value={delta}
                        onChange={(ev) => setDelta(ev.target.value)}
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
                    options={adjustmentReasons.map((r) => ({ value: r.code, label: r.label }))}
                    className="w-56"
                  />
                  <FormField label={b.comment} className="min-w-64 flex-1">
                    {(id) => (
                      <Input
                        id={id}
                        value={comment}
                        onChange={(ev) => setComment(ev.target.value)}
                        minLength={3}
                        required
                      />
                    )}
                  </FormField>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {b.adjust}
                  </Button>
                </form>
              ) : null
            }
          />
        )}
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
      {dialog}
    </div>
  );
}

function ScoresTable({
  scores,
  openScore,
  onToggle,
  busy,
  onRecompute,
  adjustForm,
}: {
  readonly scores: readonly ShiftScoreView[];
  readonly openScore: string | null;
  readonly onToggle: (id: string) => void;
  readonly busy: boolean;
  readonly onRecompute: (score: ShiftScoreView) => void;
  readonly adjustForm: (score: ShiftScoreView) => React.ReactNode;
}) {
  const columns: Column<ShiftScoreView>[] = [
    {
      key: 'date',
      header: b.period,
      cell: (s) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{s.businessDate}</span>
          <StatusPill tone={SCORE_TONE[s.status]}>{all.bonus.statuses[s.status]}</StatusPill>
        </div>
      ),
    },
    {
      key: 'score',
      header: b.points,
      cell: (s) => (
        <span className="tabular-nums">
          {s.score ?? '—'} <Muted>({`${s.earned}/${s.applicableMax}`})</Muted>
          {s.excludedReason ? <Muted> · {s.excludedReason}</Muted> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onToggle(s.id)}>
            {b.detail}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onRecompute(s)}
            >
              {b.recompute}
            </Button>
            <InfoTip text={hints.bonusRecompute} />
          </div>
        </div>
      ),
    },
  ];
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
    <DataTable
      columns={columns}
      rows={scores}
      rowKey={(s) => s.id}
      empty={b.empty}
      pageSize={10}
      expanded={(s) =>
        openScore === s.id ? (
          <div className="flex flex-col gap-4">
            <DataTable
              columns={criteriaColumns}
              rows={s.criteria}
              rowKey={(c) => c.criterion}
              empty={b.empty}
              pageSize={25}
              rowClassName={(c) =>
                c.status === 'missed' ? 'bg-red-50/60 dark:bg-red-950/30' : undefined
              }
            />
            {adjustForm(s)}
            {s.adjustments.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {s.adjustments.map((a) => (
                  <li key={a.id}>
                    {all.bonus.criteria[a.criterion]} {a.delta > 0 ? '+' : ''}
                    {a.delta} · {a.status} <Muted>{` · ${a.reasonCode} · ${a.comment}`}</Muted>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null
      }
    />
  );
}
