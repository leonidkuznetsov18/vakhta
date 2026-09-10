import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HandoverListItemView, MediaLinkView } from '@vakhta/contracts';
import {
  HANDOVER_RESOLUTIONS,
  canTransitionHandover,
  type HandoverResolution,
  type HandoverStatus,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { DateField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import {
  LiveBadge,
  Muted,
  ROW_DANGER,
  StatusPill,
  type Tone,
  Toolbar,
} from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { handoversApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/ui-store';
import { useLiveUpdates } from '@/lib/live';
import { useOrg } from '@/lib/org';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { Deadline } from '@/components/app/deadline';
import { CheckIcon, EyeIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Lightbox, PhotoThumb, type LightboxImage } from '@/components/app/photo';
import { HowItWorks } from '@/components/app/how-it-works';
import { useDeepLinkedId } from '@/lib/route';

const all = messages(currentLocale());
const h = all.admin.handover;
const hints = all.ui.hints;
/**
 * A report is in one of four places as far as anyone reading this page is concerned: a draft, sent
 * and waiting, approved, or approved with a remark — plus superseded, which means a newer report
 * replaced it. The statuses left over from the days when the next shift accepted zones and disputes
 * were resolved say nothing a reader can act on, so they are shown as the one they amount to.
 */
const SHOWN_AS: Record<
  HandoverStatus,
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REMARK' | 'SUPERSEDED'
> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  // Raised by the next shift, still waiting on the master: for the reader it is simply waiting.
  DISPUTED: 'SUBMITTED',
  // Accepted by the next shift, or by the master, or found to be nobody's fault: all approved.
  ACCEPTED: 'APPROVED',
  RESOLVED_ACCEPTED: 'APPROVED',
  RESOLVED_NO_FAULT: 'APPROVED',
  RESOLVED_ISSUE_CONFIRMED: 'REMARK',
  SUPERSEDED: 'SUPERSEDED',
};

const STATUS_TONE: Record<(typeof SHOWN_AS)[HandoverStatus], Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REMARK: 'danger',
  SUPERSEDED: 'neutral',
};

/** "Cleanliness and handover" (spec 9.1): acceptance queue, disputes, overdue, photos via signed links, decisions. */
export function HandoverPage() {
  const { org } = useOrg();
  const [siteId, setSiteId] = usePersistentState('handover.siteId', '');
  /** Empty means every day; the reports of one shift are found by picking that day. */
  const [date, setDate] = usePersistentState('handover.date', '');
  const [scope, setScope] = usePersistentState<'pending' | 'overdue' | 'all'>(
    'handover.scope',
    'pending',
  );
  const [openId, setOpenId] = useDeepLinkedId('handover', 'handover.openId');
  /**
   * The comment belongs to the report it is written for, not to the page: one shared string carried
   * a half-typed remark over to whatever row was opened next. Keyed by report id, like every other
   * per-row draft in the panel — a store would buy nothing here, the state dies with the page.
   */
  const [comments, setComments] = useState<Record<string, string>>({});
  const client = useQueryClient();

  const query = { ...(siteId ? { siteId } : {}), ...(date ? { date } : {}), scope };
  const list = useQuery({
    queryKey: keys.handovers(query),
    queryFn: () => handoversApi.list(query),
  });
  const rows = list.data ?? [];
  const live = useLiveUpdates(handoversApi.streamUrl(), 'handover', ['handovers']);

  const detail =
    useQuery({
      queryKey: keys.handover(openId),
      queryFn: () => handoversApi.detail(openId!),
      enabled: openId !== null,
    }).data ?? null;

  /** One decision at a time; the list and the open report are both stale once it lands. */
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: HandoverResolution; comment: string }) =>
      handoversApi.resolve(v.id, { decision: v.decision, comment: v.comment }),
    onSuccess: async (_result, v) => {
      notifySuccess(h.applied);
      setComments((c) => ({ ...c, [v.id]: '' }));
      await client.invalidateQueries({ queryKey: ['handovers'] });
    },
  });
  const busy = decide.isPending;
  const error = readError(list.error ?? decide.error);

  /**
   * The master's decision is two buttons: approve the checklist (the employee is thanked and earns
   * a point) or send a remark (the checklist is marked and the employee gets the text). The remark
   * needs the text; an approval does not.
   */
  function resolve(row: HandoverListItemView, chosen: HandoverResolution) {
    const text = (comments[row.id] ?? '').trim();
    if (chosen === 'RESOLVED_ISSUE_CONFIRMED' && text.length < 3) return;
    decide.mutate({
      id: row.id,
      decision: chosen,
      comment: text.length >= 3 ? text : h.approveChecklist,
    });
  }

  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; start: number }>({
    images: [],
    start: 0,
  });
  /**
   * The signed links, read once and kept in the query cache: the gallery needs every photo of the
   * report, not only the one that was clicked, and the link the server signs lives five minutes.
   */
  const linkOf = (mediaId: string) => client.getQueryData<MediaLinkView>(keys.media(mediaId))?.url;
  const trackedLink = (mediaId: string) =>
    client.fetchQuery({
      queryKey: keys.media(mediaId),
      queryFn: () => handoversApi.mediaLink(mediaId),
      staleTime: 4 * 60_000,
    });

  const columns: Column<HandoverListItemView>[] = [
    {
      key: 'submitted',
      header: h.submitted,
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.submittedAt)}</span>,
    },
    { key: 'zone', header: h.zone, cell: (row) => row.zoneName ?? <Muted>{h.noZone}</Muted> },
    { key: 'submitter', header: h.submitter, cell: (row) => row.submittedByName },
    {
      key: 'status',
      header: h.status,
      // One pill: a row is in one state, and "cleaning not finished" belongs with the report itself,
      // where the reason for it is written.
      cell: (row) => (
        <StatusPill tone={STATUS_TONE[SHOWN_AS[row.status]]}>
          {h.shown[SHOWN_AS[row.status]]}
        </StatusPill>
      ),
    },
    { key: 'remarks', header: h.remarks, align: 'right', cell: (row) => row.remarks },
    { key: 'photos', header: h.photos, align: 'right', cell: (row) => row.photos.length },
    {
      key: 'deadline',
      header: (
        <span className="inline-flex items-center gap-1">
          {h.deadline}
          <InfoTip text={hints.handoverDeadline} />
        </span>
      ),
      cell: (row) => <Deadline at={row.acceptDeadlineAt} breached={row.overdue} />,
    },
  ];

  /** The report under its row: decision form, checklist and notes, photo gallery, acceptance and decisions. */
  function renderDetail(row: HandoverListItemView) {
    if (!detail || detail.handover.id !== row.id) return <Muted>{all.ui.common.loading}</Muted>;
    return (
      <div className="flex flex-col gap-4 py-1" data-testid="handover-detail">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{h.checklist}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {detail.handover.items
                .filter((item) => item.kind === 'CHECK')
                .map((item) => (
                  <li key={item.key} className="flex gap-2">
                    <span aria-hidden="true">{!item.answered ? '▫️' : item.ok ? '✅' : '⚠️'}</span>
                    <span className="min-w-0">
                      {item.label}
                      {item.answered && !item.ok && (
                        <Muted>
                          {` · ${item.remarkCategory} · ${item.remarkText} · ${item.safeToWork ? h.safe : h.unsafe}${item.needs.length > 0 ? ` · ${item.needs.map((n) => all.handover.needs[n]).join(', ')}` : ''}`}
                        </Muted>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
            {detail.handover.cannotCompleteReason && (
              <p className="mt-2 text-sm text-muted-foreground">
                {h.cannotComplete}: {detail.handover.cannotCompleteReason}
                {detail.handover.cannotCompleteComment
                  ? ` · ${detail.handover.cannotCompleteComment}`
                  : ''}
              </p>
            )}
          </div>
          {detail.handover.items.some((item) => item.kind === 'NOTE' && item.answered) && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{h.notes}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {detail.handover.items
                  .filter((item) => item.kind === 'NOTE' && item.answered)
                  .map((item) => (
                    <li key={item.key} className="rounded-md border bg-muted/40 px-3 py-2">
                      <Muted className="text-xs">{item.label}</Muted>
                      <p className="whitespace-pre-wrap">{item.note ?? '—'}</p>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
              {h.photos}
              <Muted className="font-normal">({detail.handover.photos.length})</Muted>
              <InfoTip text={hints.handoverPhoto} />
            </h3>
            {/* The count in the heading already says there are none. */}
            {detail.handover.photos.length === 0 ? null : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {detail.handover.photos.map((p) => (
                  <PhotoThumb
                    key={p.itemKey}
                    media={p.media}
                    loadLink={trackedLink}
                    label={p.label}
                    badge={all.handover.quality[p.media.quality]}
                    onOpen={() => {
                      const loaded = detail.handover.photos.filter((x) => linkOf(x.media.id));
                      setLightbox({
                        images: loaded.map((x) => ({
                          url: linkOf(x.media.id)!,
                          label: `${h.photoBefore}: ${x.label}`,
                        })),
                        start: loaded.findIndex((x) => x.itemKey === p.itemKey),
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {/* The decision goes last: the checklist, the note and the photos are what it is made
              on, and the status column already says how a report ended, so nothing repeats it here. */}
          {HANDOVER_RESOLUTIONS.some((d) => canTransitionHandover(row.status, d)) && (
            <div className="flex flex-col gap-2">
              <p className="max-w-3xl text-sm whitespace-normal text-muted-foreground">
                {h.reviewHint}
              </p>
              <FormField label={h.remarkComment}>
                {(id) => (
                  <Textarea
                    rows={2}
                    id={id}
                    value={comments[row.id] ?? ''}
                    onChange={(e) => setComments((c) => ({ ...c, [row.id]: e.target.value }))}
                    minLength={3}
                  />
                )}
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="success"
                  disabled={busy || !canTransitionHandover(row.status, 'RESOLVED_ACCEPTED')}
                  onClick={() => resolve(row, 'RESOLVED_ACCEPTED')}
                >
                  <CheckIcon aria-hidden="true" />
                  {h.approveChecklist}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    busy ||
                    (comments[row.id] ?? '').trim().length < 3 ||
                    !canTransitionHandover(row.status, 'RESOLVED_ISSUE_CONFIRMED')
                  }
                  onClick={() => resolve(row, 'RESOLVED_ISSUE_CONFIRMED')}
                >
                  <TriangleAlertIcon aria-hidden="true" />
                  {h.addRemark}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="handover" />
      <Toolbar>
        <SelectField
          label={h.site}
          value={siteId}
          onChange={setSiteId}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <div className="flex items-center gap-1">
          <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <TabsList>
              <TabsTrigger value="pending">{h.scopePending}</TabsTrigger>
              <TabsTrigger value="overdue">{h.scopeOverdue}</TabsTrigger>
              <TabsTrigger value="all">{h.scopeAll}</TabsTrigger>
            </TabsList>
          </Tabs>
          <InfoTip text={hints.handoverScope} />
        </div>
        {/* One day of reports, with a way back to all of them: a shift is looked up by its date. */}
        <div className="flex items-end gap-1">
          <DateField
            label={h.date}
            value={date}
            onChange={setDate}
            hint={hints.handoverDate}
            className="w-44"
          />
          {date && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={h.dateAll}
              title={h.dateAll}
              onClick={() => setDate('')}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <DataTable
        columns={columns}
        rows={rows}
        storageKey="handover"
        onRowClick={(row) => setOpenId(openId === row.id ? null : row.id)}
        rowActions={(row) => [
          {
            key: 'detail',
            label: h.detail,
            icon: EyeIcon,
            onSelect: () => setOpenId(openId === row.id ? null : row.id),
          },
        ]}
        rowKey={(row) => row.id}
        empty={h.empty}
        rowClassName={(row) => (row.overdue ? ROW_DANGER : undefined)}
        activeKey={openId}
        expanded={(row) => (row.id === openId ? renderDetail(row) : null)}
      />
      <Lightbox
        images={lightbox.images}
        start={lightbox.start}
        onClose={() => setLightbox({ images: [], start: 0 })}
        title={h.photos}
      />
    </div>
  );
}
