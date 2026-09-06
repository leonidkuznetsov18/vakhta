import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { HandoverDetailView, HandoverListItemView, OrgSnapshot } from '@vakhta/contracts';
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
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { handoversApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { notifySuccess } from '@/lib/toast';
import { Deadline } from '@/components/app/deadline';
import { EyeIcon, XIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Lightbox, PhotoThumb, type LightboxImage } from '@/components/app/photo';
import { GavelIcon } from 'lucide-react';
import { useDeepLinkedId } from '@/lib/route';

const all = messages(currentLocale());
const h = all.admin.handover;
const hints = all.ui.hints;
const STATUS_TONE: Record<HandoverStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  ACCEPTED: 'success',
  DISPUTED: 'warning',
  RESOLVED_ACCEPTED: 'success',
  RESOLVED_ISSUE_CONFIRMED: 'danger',
  RESOLVED_NO_FAULT: 'success',
  SUPERSEDED: 'neutral',
};

/** "Cleanliness and handover" (spec 9.1): acceptance queue, disputes, overdue, photos via signed links, decisions. */
export function HandoverPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = usePersistentState('handover.siteId', '');
  const [scope, setScope] = usePersistentState<'pending' | 'overdue' | 'all'>(
    'handover.scope',
    'pending',
  );
  const [rows, setRows] = useState<HandoverListItemView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useDeepLinkedId('handover', 'handover.openId');
  const [detail, setDetail] = useState<HandoverDetailView | null>(null);
  const [decision, setDecision] = useState<HandoverResolution | ''>('');
  const [comment, setComment] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    setRows(await handoversApi.list({ ...(siteId ? { siteId } : {}), scope }));
  }, [siteId, scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(handoversApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('handover', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    handoversApi
      .detail(openId)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  function resolve(ev: FormEvent, row: HandoverListItemView) {
    ev.preventDefault();
    if (!decision || comment.trim().length < 3) return;
    setBusy(true);
    setError(null);
    handoversApi
      .resolve(row.id, { decision, comment: comment.trim(), ...(reasonCode ? { reasonCode } : {}) })
      .then(async () => {
        notifySuccess(h.applied);
        setDecision('');
        setComment('');
        setReasonCode('');
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const handoverReasons = org?.reasonCodes.filter((r) => r.kind === 'HANDOVER' && r.isActive) ?? [];
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; start: number }>({
    images: [],
    start: 0,
  });
  const photoUrls = useRef(new Map<string, string>());
  const loadLink = useCallback((mediaId: string) => handoversApi.mediaLink(mediaId), []);
  // Remembers the signed links already fetched so the gallery can show every photo of the report.
  const trackedLink = useCallback(
    (mediaId: string) =>
      handoversApi.mediaLink(mediaId).then((l) => {
        photoUrls.current.set(mediaId, l.url);
        return l;
      }),
    [],
  );

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
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={STATUS_TONE[row.status]}>
            {all.handover.statuses[row.status]}
          </StatusPill>
          {row.cannotCompleteReason && <StatusPill tone="warning">{h.cannotComplete}</StatusPill>}
        </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{row.zoneName ?? h.noZone}</span>
          <StatusPill tone={STATUS_TONE[row.status]}>
            {all.handover.statuses[row.status]}
          </StatusPill>
          <Muted>
            {row.submittedByName} · {formatDateTime(row.submittedAt)}
          </Muted>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setOpenId(null)}
          >
            <XIcon aria-hidden="true" />
            {all.ui.common.close}
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {HANDOVER_RESOLUTIONS.some((d) => canTransitionHandover(row.status, d)) && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => resolve(e, row)}>
              <SelectField
                label={h.decision}
                hint={hints.handoverDecision}
                value={decision}
                onChange={(v) => setDecision(v as HandoverResolution)}
                placeholder="…"
                required
                options={HANDOVER_RESOLUTIONS.filter((d) =>
                  canTransitionHandover(row.status, d),
                ).map((d) => ({ value: d, label: all.handover.resolutions[d] }))}
                className="w-72"
              />
              <SelectField
                label={h.reasonCode}
                value={reasonCode}
                onChange={setReasonCode}
                placeholder="—"
                options={handoverReasons.map((r) => ({ value: r.code, label: r.label }))}
                className="w-56"
              />
              <FormField label={h.comment} className="min-w-72 flex-1">
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
              <Button type="submit" disabled={busy || !decision}>
                {h.apply}
              </Button>
            </form>
          )}
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
            {detail.handover.photos.length === 0 ? (
              <Muted>{h.noPhotos}</Muted>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {detail.handover.photos.map((p) => (
                  <PhotoThumb
                    key={p.itemKey}
                    media={p.media}
                    loadLink={trackedLink}
                    label={p.label}
                    badge={all.handover.quality[p.media.quality]}
                    onOpen={() =>
                      setLightbox({
                        images: detail.handover.photos
                          .filter((x) => photoUrls.current.has(x.media.id))
                          .map((x) => ({
                            url: photoUrls.current.get(x.media.id)!,
                            label: `${h.photoBefore}: ${x.label}`,
                          })),
                        start: detail.handover.photos
                          .filter((x) => photoUrls.current.has(x.media.id))
                          .findIndex((x) => x.itemKey === p.itemKey),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{h.reviews}</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {detail.reviews.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1">
                    <span>
                      <span className="tabular-nums">{formatDateTime(r.reviewedAt)}</span>{' '}
                      <strong>{r.reviewerName}</strong>{' '}
                      <span aria-hidden="true">{r.decision === 'ACCEPTED' ? '✅' : '⚠️'}</span>
                      {r.category ? ` · ${r.category}` : ''}
                      {r.comment ? ` · ${r.comment}` : ''}
                    </span>
                    {r.media && (
                      <PhotoThumb
                        media={r.media}
                        loadLink={loadLink}
                        label={h.photoAfter}
                        className="w-40"
                        onOpen={(url) =>
                          setLightbox({ images: [{ url, label: h.photoAfter }], start: 0 })
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{h.resolutions}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {detail.resolutions.map((r) => (
                  <li key={r.id}>
                    <span className="tabular-nums">{formatDateTime(r.at)}</span>{' '}
                    {all.handover.resolutions[r.decision]}
                    <Muted> · {r.comment}</Muted>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
          ...HANDOVER_RESOLUTIONS.filter((d) => canTransitionHandover(row.status, d)).map(
            (d, idx) => ({
              key: `decide-${d}`,
              label: all.handover.resolutions[d],
              icon: GavelIcon,
              separator: idx === 0,
              onSelect: () => {
                setDecision(d);
                setOpenId(row.id);
              },
            }),
          ),
        ]}
        rowKey={(row) => row.id}
        empty={h.empty}
        rowClassName={(row) => (row.overdue ? 'bg-red-50/60 dark:bg-red-950/30' : undefined)}
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
