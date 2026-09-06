import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OvertimeView,
  RequestDetailView,
  RequestView,
  ShiftDetailView,
} from '@vakhta/contracts';
import { SHIFT_STATES, type RequestStatus, type ShiftState } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { requestsApi, shiftsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { notifySuccess } from '@/lib/toast';
import { Deadline } from '@/components/app/deadline';
import { Textarea } from '@/components/ui/textarea';
import { EyeIcon } from 'lucide-react';
import { DetailSheet } from '@/components/app/detail-sheet';

const all = messages(currentLocale());
const r = all.admin.requests;
const hints = all.ui.hints;
const STATUS_TONE: Record<RequestStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  IN_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'warning',
};
const PROPOSAL_KINDS = ['CLOSE_SHIFT_AT', 'MOVE_BOUNDARY', 'RECLASSIFY'] as const;
type ProposalKind = (typeof PROPOSAL_KINDS)[number];

function when(req: RequestView): string {
  if (req.periodFrom)
    return req.periodTo && req.periodTo !== req.periodFrom
      ? `${req.periodFrom} – ${req.periodTo}`
      : req.periodFrom;
  if (req.assignmentDate) return req.assignmentDate;
  return '—';
}

/** "Requests" (spec 9.1): the inbox by role, decisions with a comment, overtime, interval corrections. */
export function RequestsPage() {
  const [scope, setScope] = usePersistentState<'inbox' | 'all'>('requests.scope', 'inbox');
  const [rows, setRows] = useState<RequestView[]>([]);
  const [overtime, setOvertime] = useState<OvertimeView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = usePersistentState<string | null>('requests.openId', null);
  const [detail, setDetail] = useState<RequestDetailView | null>(null);
  const [shift, setShift] = useState<ShiftDetailView | null>(null);
  const [comment, setComment] = useState('');
  const [approvedMinutes, setApprovedMinutes] = useState('');
  const [proposalKind, setProposalKind] = useState<ProposalKind>('CLOSE_SHIFT_AT');
  const [proposalInterval, setProposalInterval] = useState('');
  const [proposalTime, setProposalTime] = useState('');
  const [proposalState, setProposalState] = useState<ShiftState>('WORKING');
  const [overtimeComment, setOvertimeComment] = useState<Record<string, string>>({});
  const reloadRef = useRef<() => void>(() => undefined);

  const reload = useCallback(async () => {
    const [list, ot] = await Promise.all([
      requestsApi.list({ scope }),
      requestsApi.overtime('pending'),
    ]);
    setRows(list);
    setOvertime(ot);
  }, [scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(requestsApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('request', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setShift(null);
      return;
    }
    let alive = true;
    requestsApi
      .detail(openId)
      .then(async (d) => {
        if (!alive) return;
        setDetail(d);
        if (d.request.type === 'CORRECTION' && d.request.shiftSessionId) {
          const s = await shiftsApi.detail(d.request.shiftSessionId);
          if (alive) setShift(s);
        } else setShift(null);
      })
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  function buildProposal() {
    if (proposalKind === 'CLOSE_SHIFT_AT')
      return proposalTime
        ? { kind: 'CLOSE_SHIFT_AT' as const, endedAt: new Date(proposalTime).toISOString() }
        : undefined;
    if (proposalKind === 'MOVE_BOUNDARY')
      return proposalInterval && proposalTime
        ? {
            kind: 'MOVE_BOUNDARY' as const,
            intervalId: proposalInterval,
            newStartedAt: new Date(proposalTime).toISOString(),
          }
        : undefined;
    return proposalInterval
      ? { kind: 'RECLASSIFY' as const, intervalId: proposalInterval, newState: proposalState }
      : undefined;
  }

  function decide(req: RequestView, decision: 'APPROVED' | 'REJECTED') {
    const text = comment.trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    const proposal =
      decision === 'APPROVED' && req.type === 'CORRECTION' ? buildProposal() : undefined;
    requestsApi
      .decide(req.id, {
        decision,
        comment: text,
        ...(approvedMinutes && (req.type === 'LATE' || req.type === 'EARLY_LEAVE')
          ? { approvedMinutes: Number(approvedMinutes) }
          : {}),
        ...(proposal ? { proposal } : {}),
      })
      .then(async () => {
        notifySuccess(r.decided);
        setComment('');
        setApprovedMinutes('');
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  function decideOvertime(row: OvertimeView, decision: 'APPROVED' | 'REJECTED') {
    const text = (overtimeComment[row.shiftSessionId] ?? '').trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    requestsApi
      .decideOvertime(row.shiftSessionId, { decision, comment: text })
      .then(async () => {
        notifySuccess(r.decided);
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const openRow = rows.find((r) => r.id === openId) ?? null;

  const columns: Column<RequestView>[] = [
    {
      key: 'submitted',
      header: r.submitted,
      cell: (req) => <span className="tabular-nums">{formatDateTime(req.submittedAt)}</span>,
    },
    { key: 'type', header: r.type, cell: (req) => all.requests.types[req.type] },
    {
      key: 'employee',
      header: r.employee,
      cell: (req) => (
        <span>
          {req.employeeName}
          {req.counterpartName ? <Muted> ↔ {req.counterpartName}</Muted> : null}
        </span>
      ),
    },
    {
      key: 'period',
      header: r.period,
      cell: (req) => (
        <span>
          {when(req)}
          {req.minutes !== null ? (
            <Muted>{` · ${req.minutes} ${all.admin.operations.minutes}`}</Muted>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: r.status,
      cell: (req) => (
        <StatusPill tone={STATUS_TONE[req.status]}>{all.requests.statuses[req.status]}</StatusPill>
      ),
    },
    {
      key: 'step',
      header: (
        <span className="inline-flex items-center gap-1">
          {r.step}
          <InfoTip text={hints.requestsStep} />
        </span>
      ),
      cell: (req) =>
        req.currentStepKey
          ? `${req.currentStep + 1}/${req.totalSteps} · ${r.steps[req.currentStepKey as keyof typeof r.steps] ?? req.currentStepKey}`
          : '—',
    },
    {
      key: 'deadline',
      header: r.deadline,
      cell: (req) => <Deadline at={req.stepDeadlineAt} breached={req.overdue} />,
    },
  ];

  const overtimeColumns: Column<OvertimeView>[] = [
    { key: 'employee', header: r.employee, cell: (row) => row.employeeName },
    { key: 'date', header: all.admin.operations.plan, cell: (row) => row.businessDate },
    { key: 'minutes', header: r.overtimeMinutes, align: 'right', cell: (row) => row.minutes },
    {
      key: 'decision',
      header: r.decision,
      cell: (row) => (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decideOvertime(row, 'APPROVED');
          }}
        >
          <FormField label={r.comment} className="min-w-64">
            {(id) => (
              <Input
                id={id}
                value={overtimeComment[row.shiftSessionId] ?? ''}
                onChange={(e) =>
                  setOvertimeComment((c) => ({ ...c, [row.shiftSessionId]: e.target.value }))
                }
                minLength={3}
                required
              />
            )}
          </FormField>
          <Button type="submit" size="sm" disabled={busy}>
            {r.approve}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => decideOvertime(row, 'REJECTED')}
          >
            {r.reject}
          </Button>
        </form>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <div className="flex items-center gap-1">
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'inbox' | 'all')}>
            <TabsList>
              <TabsTrigger value="inbox">{r.scopeInbox}</TabsTrigger>
              <TabsTrigger value="all">{r.scopeAll}</TabsTrigger>
            </TabsList>
          </Tabs>
          <InfoTip text={hints.requestsScope} />
        </div>
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <DataTable
        columns={columns}
        rows={rows}
        storageKey="requests"
        onRowClick={(row) => setOpenId(openId === row.id ? null : row.id)}
        rowActions={(row) => [
          {
            key: 'detail',
            label: r.detail,
            icon: EyeIcon,
            onSelect: () => setOpenId(openId === row.id ? null : row.id),
          },
        ]}
        rowKey={(req) => req.id}
        empty={r.empty}
        rowClassName={(req) => (req.overdue ? 'bg-red-50/60 dark:bg-red-950/30' : undefined)}
        activeKey={openId}
      />
      {openRow && (
        <DetailSheet
          open={openRow !== null}
          onOpenChange={(open) => !open && setOpenId(null)}
          title={
            <>
              {all.requests.types[openRow.type]}
              <StatusPill tone={STATUS_TONE[openRow.status]}>
                {all.requests.statuses[openRow.status]}
              </StatusPill>
            </>
          }
          description={`${openRow.employeeName} · ${formatDateTime(openRow.submittedAt)}`}
          wide
        >
          {((req) =>
            detail && detail.request.id === req.id ? (
              <>
                <div className="flex flex-col gap-4">
                  {req.comment && <p className="text-sm">{req.comment}</p>}
                  {req.hasMedicalDocument && <MedicalLink request={detail.request} />}
                  {req.currentStepKey && (
                    <form
                      className="flex flex-wrap items-end gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        decide(req, 'APPROVED');
                      }}
                    >
                      {(req.type === 'LATE' || req.type === 'EARLY_LEAVE') && (
                        <FormField
                          label={r.approvedMinutes}
                          hint={hints.requestsApprovedMinutes}
                          className="w-56"
                        >
                          {(id) => (
                            <Input
                              id={id}
                              type="number"
                              min={0}
                              max={720}
                              value={approvedMinutes}
                              onChange={(e) => setApprovedMinutes(e.target.value)}
                            />
                          )}
                        </FormField>
                      )}
                      {req.type === 'CORRECTION' && shift && (
                        <>
                          <SelectField
                            label={r.proposalKind}
                            hint={hints.requestsProposal}
                            value={proposalKind}
                            onChange={(v) => setProposalKind(v as ProposalKind)}
                            options={PROPOSAL_KINDS.map((k) => ({ value: k, label: k }))}
                            className="w-52"
                          />
                          {proposalKind !== 'CLOSE_SHIFT_AT' && (
                            <SelectField
                              label={r.proposalInterval}
                              value={proposalInterval}
                              onChange={setProposalInterval}
                              placeholder="…"
                              required
                              options={shift.intervals.map((i) => ({
                                value: i.id,
                                label: `${all.states[i.state]} ${formatDateTime(i.startedAt)} – ${i.endedAt ? formatDateTime(i.endedAt) : '…'}`,
                              }))}
                              className="w-80"
                            />
                          )}
                          {proposalKind !== 'RECLASSIFY' && (
                            <FormField label={r.proposalTime} className="w-56">
                              {(id) => (
                                <Input
                                  id={id}
                                  type="datetime-local"
                                  value={proposalTime}
                                  onChange={(e) => setProposalTime(e.target.value)}
                                  required
                                />
                              )}
                            </FormField>
                          )}
                          {proposalKind === 'RECLASSIFY' && (
                            <SelectField
                              label={r.proposalState}
                              value={proposalState}
                              onChange={(v) => setProposalState(v as ShiftState)}
                              options={SHIFT_STATES.map((s) => ({
                                value: s,
                                label: all.states[s],
                              }))}
                              className="w-56"
                            />
                          )}
                        </>
                      )}
                      <FormField label={r.comment} className="min-w-72 flex-1">
                        {(id) => (
                          <Textarea
                            rows={2}
                            id={id}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            minLength={3}
                            required
                          />
                        )}
                      </FormField>
                      <Button type="submit" disabled={busy}>
                        {r.approve}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => decide(req, 'REJECTED')}
                      >
                        {r.reject}
                      </Button>
                    </form>
                  )}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{r.history}</h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {detail.decisions.map((d) => (
                        <li key={d.id}>
                          <span className="tabular-nums">{formatDateTime(d.at)}</span> {d.stepKey}:{' '}
                          {d.decision === 'APPROVED'
                            ? all.requests.approvedShort
                            : all.requests.rejectedShort}
                          <Muted>{` · ${d.actingRole ?? d.actorType} · ${d.comment}`}</Muted>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : null)(openRow)}
        </DetailSheet>
      )}

      <Section title={r.overtimeTitle} hint={hints.requestsOvertime}>
        <DataTable
          columns={overtimeColumns}
          rows={overtime}
          rowKey={(row) => row.shiftSessionId}
          empty={r.overtimeEmpty}
        />
      </Section>
    </div>
  );
}

/** The document opens for HR only; for others the server answers 403 and writes an audit row (FR-REQ-02). */
function MedicalLink({ request }: { readonly request: RequestView }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!request.medicalMediaId)
    return <p className="text-sm text-muted-foreground">{r.medical}: ✓</p>;
  if (url) {
    return (
      <p>
        <Button asChild variant="link" size="sm">
          <a href={url} target="_blank" rel="noreferrer">
            {r.openMedical}
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        </Button>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1">
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => {
          requestsApi
            .medicalLink(request.id)
            .then((l) => setUrl(l.url))
            .catch((e: unknown) => setFailed(describeError(e)));
        }}
      >
        {failed ?? r.openMedical}
      </Button>
      <InfoTip text={hints.requestsMedical} />
    </p>
  );
}
