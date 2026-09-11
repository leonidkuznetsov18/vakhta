import { QueryFeedback } from '@/components/app/query-feedback';
import { DetailText } from '@/components/app/row-detail';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OvertimeView, RequestView } from '@vakhta/contracts';
import { SHIFT_STATES, type RequestStatus, type ShiftState } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StateFilter } from '@/shared/ui/state-filter';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import {
  LiveBadge,
  Muted,
  ROW_DANGER,
  Section,
  StatusPill,
  type Tone,
  Toolbar,
} from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { requestsApi, shiftsApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/ui-store';
import { useLiveUpdates } from '@/lib/live';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { Deadline } from '@/components/app/deadline';
import { Textarea } from '@/components/ui/textarea';
import { EyeIcon } from 'lucide-react';
import { HowItWorks } from '@/components/app/how-it-works';
import { useDeepLinkedId } from '@/lib/route';

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
  const [openId, setOpenId] = useDeepLinkedId('requests', 'requests.openId');
  const [comment, setComment] = useState('');
  const [approvedMinutes, setApprovedMinutes] = useState('');
  const [proposalKind, setProposalKind] = useState<ProposalKind>('CLOSE_SHIFT_AT');
  const [proposalInterval, setProposalInterval] = useState('');
  const [proposalTime, setProposalTime] = useState('');
  const [proposalState, setProposalState] = useState<ShiftState>('WORKING');
  const [overtimeComment, setOvertimeComment] = useState<Record<string, string>>({});
  const client = useQueryClient();

  const list = useQuery({
    queryKey: keys.requests({ scope }),
    queryFn: () => requestsApi.list({ scope }),
  });
  const rows = list.data ?? [];
  const overtimeQuery = useQuery({
    queryKey: keys.overtime('pending'),
    queryFn: () => requestsApi.overtime('pending'),
  });
  const overtime = overtimeQuery.data ?? [];
  const live = useLiveUpdates(requestsApi.streamUrl(), 'request', ['requests']);

  // An id that belongs to the overtime table below is not a request: asking the server for it
  // would answer 404 over a page that is showing the right row.
  const openRequestId = openId && rows.some((r) => r.id === openId) ? openId : null;
  const detailQuery = useQuery({
    queryKey: keys.request(openRequestId),
    queryFn: () => requestsApi.detail(openRequestId!),
    enabled: openRequestId !== null,
  });
  const detail = detailQuery.data ?? null;
  // A correction is decided against the shift it corrects, so that shift is read beside it.
  const correctionShiftId =
    detail?.request.type === 'CORRECTION' ? detail.request.shiftSessionId : null;
  const correctionQuery = useQuery({
    queryKey: keys.shift(correctionShiftId),
    queryFn: () => shiftsApi.detail(correctionShiftId!),
    enabled: correctionShiftId !== null,
  });
  const shift = correctionQuery.data ?? null;

  const refresh = () => client.invalidateQueries({ queryKey: ['requests'] });
  const decision = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      notifySuccess(r.decided);
      await refresh();
    },
  });
  const busy = decision.isPending;
  const error = readError(decision.error);

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

  function decide(req: RequestView, verdict: 'APPROVED' | 'REJECTED') {
    const text = comment.trim();
    if (text.length < 3) return;
    const proposal =
      verdict === 'APPROVED' && req.type === 'CORRECTION' ? buildProposal() : undefined;
    setComment('');
    setApprovedMinutes('');
    decision.mutate(() =>
      requestsApi.decide(req.id, {
        decision: verdict,
        comment: text,
        ...(approvedMinutes && (req.type === 'LATE' || req.type === 'EARLY_LEAVE')
          ? { approvedMinutes: Number(approvedMinutes) }
          : {}),
        ...(proposal ? { proposal } : {}),
      }),
    );
  }

  function decideOvertime(row: OvertimeView, verdict: 'APPROVED' | 'REJECTED') {
    const text = (overtimeComment[row.shiftSessionId] ?? '').trim();
    if (text.length < 3) return;
    decision.mutate(() =>
      requestsApi.decideOvertime(row.shiftSessionId, { decision: verdict, comment: text }),
    );
  }

  // The overtime rows sit in the same section under the requests, so they share its deep link:
  // arriving from the overview has to open the row the number stood for, not nothing at all.
  const openOvertime = overtime.some((row) => row.shiftSessionId === openId) ? openId : null;

  const columns: Column<RequestView>[] = [
    {
      key: 'submitted',
      sortValue: (req) => req.submittedAt,
      header: r.submitted,
      cell: (req) => <span className="tabular-nums">{formatDateTime(req.submittedAt)}</span>,
    },
    { key: 'type', header: r.type, cell: (req) => all.requests.types[req.type] },
    {
      key: 'employee',
      sortValue: (req) => req.employeeName,
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
      sortValue: (req) => all.requests.statuses[req.status],
      header: r.status,
      cell: (req) => (
        <StatusPill tone={STATUS_TONE[req.status]}>{all.requests.statuses[req.status]}</StatusPill>
      ),
    },
    {
      key: 'step',
      label: r.step,
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
      sortValue: (req) => req.stepDeadlineAt,
      header: r.deadline,
      cell: (req) => <Deadline at={req.stepDeadlineAt} breached={req.overdue} />,
    },
  ];

  const overtimeColumns: Column<OvertimeView>[] = [
    {
      key: 'employee',
      header: r.employee,
      cell: (row) => row.employeeName,
      sortValue: (row) => row.employeeName,
    },
    {
      key: 'date',
      header: all.admin.operations.plan,
      cell: (row) => row.businessDate,
      sortValue: (row) => row.businessDate,
    },
    {
      key: 'minutes',
      header: r.overtimeMinutes,
      align: 'right',
      cell: (row) => row.minutes,
      sortValue: (row) => row.minutes,
    },
  ];

  /** The decision under the row it belongs to: a form squeezed into a cell had no room to be read. */
  function overtimeDecision(row: OvertimeView) {
    return (
      <form
        className="flex max-w-xl flex-col gap-3 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          decideOvertime(row, 'APPROVED');
        }}
      >
        <FormField label={r.comment}>
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
        <div className="flex gap-2">
          <Button type="submit" variant="success" disabled={busy}>
            {r.approve}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => decideOvertime(row, 'REJECTED')}
          >
            {r.reject}
          </Button>
        </div>
      </form>
    );
  }

  /**
   * The request opened under its own row: the comment, the decision and what has been decided so
   * far. The type, the employee and the status are columns of the row above, so they stay there.
   */
  function requestDetail(req: RequestView) {
    if (!detail || detail.request.id !== req.id) return <QueryFeedback query={detailQuery} />;
    return (
      <div
        className="grid min-w-0 items-start gap-6 py-1 lg:grid-cols-2"
        data-testid="request-detail"
      >
        {(detailQuery.isError || detailQuery.fetchStatus === 'paused') && (
          <div className="lg:col-span-2">
            <QueryFeedback query={detailQuery} />
          </div>
        )}
        <div className="flex max-w-2xl flex-col gap-3">
          {req.comment && <DetailText label={r.comment} text={req.comment} />}
          {req.hasMedicalDocument && <MedicalLink request={detail.request} />}
          {correctionShiftId && <QueryFeedback query={correctionQuery} />}
          {req.currentStepKey && (!correctionShiftId || correctionQuery.isSuccess) && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                decide(req, 'APPROVED');
              }}
            >
              {(req.type === 'LATE' || req.type === 'EARLY_LEAVE') && (
                <FormField label={r.approvedMinutes} hint={hints.requestsApprovedMinutes}>
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
                    searchable={false}
                    value={proposalKind}
                    onChange={(v) => setProposalKind(v as ProposalKind)}
                    options={PROPOSAL_KINDS.map((k) => ({ value: k, label: k }))}
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
                    />
                  )}
                  {proposalKind !== 'RECLASSIFY' && (
                    <FormField label={r.proposalTime}>
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
                      searchable={false}
                      value={proposalState}
                      onChange={(v) => setProposalState(v as ShiftState)}
                      options={SHIFT_STATES.map((st) => ({ value: st, label: all.states[st] }))}
                    />
                  )}
                </>
              )}
              <FormField label={r.comment}>
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
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="success" disabled={busy}>
                  {r.approve}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => decide(req, 'REJECTED')}
                >
                  {r.reject}
                </Button>
              </div>
            </form>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">{r.history}</h3>
          <ul
            tabIndex={0}
            aria-label={r.history}
            className="flex max-h-80 flex-col gap-4 overflow-y-auto rounded-md border p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
          >
            {detail.decisions.map((d) => (
              <li key={d.id}>
                <span className="tabular-nums">{formatDateTime(d.at)}</span> {d.stepKey}:{' '}
                {d.decision === 'APPROVED'
                  ? all.requests.approvedShort
                  : all.requests.rejectedShort}
                <Muted>{` · ${d.actingRole ?? d.actorType}`}</Muted>
                <p className="whitespace-pre-wrap">{d.comment}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="requests" />
      <Toolbar>
        <div className="flex items-center gap-1">
          <StateFilter
            value={scope}
            onChange={setScope}
            label={all.admin.sections.requests}
            options={[
              { value: 'inbox', label: r.scopeInbox },
              { value: 'all', label: r.scopeAll },
            ]}
          />
          <InfoTip text={hints.requestsScope} />
        </div>
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <DataTable
        queryState={list}
        columns={columns}
        rows={rows}
        storageKey="requests"
        primaryKey="employee"
        rowLabel={(req) => `${req.employeeName} · ${all.requests.types[req.type]}`}
        resetKey={scope}
        truncated={scope === 'all' && rows.length >= 500}
        searchText={(req) =>
          `${req.employeeName} ${req.counterpartName ?? ''} ${all.requests.types[req.type]} ${all.requests.statuses[req.status]} ${req.comment ?? ''}`
        }
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
        rowClassName={(req) => (req.overdue ? ROW_DANGER : undefined)}
        activeKey={openId}
        expanded={(req) => (req.id === openId ? requestDetail(req) : null)}
      />
      <Section title={r.overtimeTitle} hint={hints.requestsOvertime}>
        <DataTable
          queryState={overtimeQuery}
          columns={overtimeColumns}
          storageKey="requests-overtime"
          searchText={(row) => `${row.employeeName} ${row.businessDate}`}
          rows={overtime}
          rowKey={(row) => row.shiftSessionId}
          onRowClick={(row) => setOpenId(openId === row.shiftSessionId ? null : row.shiftSessionId)}
          activeKey={openOvertime}
          expanded={(row) => (row.shiftSessionId === openOvertime ? overtimeDecision(row) : null)}
          empty={r.overtimeEmpty}
        />
      </Section>
    </div>
  );
}

/** The document opens for HR only; for others the server answers 403 and writes an audit row (FR-REQ-02). */
function MedicalLink({ request }: { readonly request: RequestView }) {
  // Asked for by name, never in passing: every signing of this link is an audit row.
  const open = useMutation({ mutationFn: () => requestsApi.medicalLink(request.id) });
  const url = open.data?.url ?? null;
  const failed = readError(open.error);
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
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {failed ?? r.openMedical}
      </Button>
      <InfoTip text={hints.requestsMedical} />
    </p>
  );
}
