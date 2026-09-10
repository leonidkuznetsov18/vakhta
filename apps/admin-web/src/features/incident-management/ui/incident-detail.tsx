import type { IncidentView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { FormField, SelectField } from '@/components/app/fields';
import { PhotoThumb } from '@/components/app/photo';
import { Muted } from '@/components/app/page';
import { formatDateTime as formatTime } from '@/lib/format';
import { currentLocale } from '@/i18n';
import { Textarea } from '@/components/ui/textarea';
import type { IncidentWorkspaceModel } from '../model/workspace';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

export function IncidentDetail({
  row,
  model,
}: {
  row: IncidentView;
  model: IncidentWorkspaceModel;
}) {
  const { detail, trackedLink, setLightbox, busy, knowledge, form, setField, apply, others } =
    model;
  const draft = form(row);

  return (
    <div className="flex flex-col gap-6 py-1" data-testid="incident-detail">
      {/* What happened first, and what to do about it under it: the decision is taken after
            reading the reports, not beside them. */}
      {detail && detail.incident.id === row.id ? (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{i.reportsTitle}</h3>
            <ul className="flex flex-col gap-3 text-sm">
              {detail.reports.map((r) => (
                <li key={r.id} className="flex flex-col gap-1">
                  <div>
                    <span className="tabular-nums">{formatTime(r.reportedAt)}</span>{' '}
                    <strong>{r.fullName}</strong>{' '}
                    <Muted>
                      {`${r.stoppedWork ? i.stoppedWork : i.notStopped}${r.hasPhoto && !r.media ? ` · ${i.photo}` : ''}${r.comment ? ` · ${r.comment}` : ''}`}
                    </Muted>
                  </div>
                  {/* The photo itself, not the word "photo": what the employee saw is the whole
                          point of the report, and it is shown here the way a handover shows its own. */}
                  {r.media && (
                    <PhotoThumb
                      className="w-40"
                      media={r.media}
                      loadLink={trackedLink}
                      label={`${r.fullName} · ${formatTime(r.reportedAt)}`}
                      onOpen={(url) =>
                        setLightbox([{ url, label: `${r.fullName} · ${formatTime(r.reportedAt)}` }])
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{i.history}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {detail.history.map((h) => (
                <li key={h.id}>
                  <span className="tabular-nums">{formatTime(h.at)}</span>{' '}
                  {all.incidents.statuses[h.toStatus]}
                  {h.rootCause && (
                    <p className="whitespace-pre-wrap">
                      {i.rootCause}: {h.rootCause}
                    </p>
                  )}
                  {h.resolution && (
                    <p className="whitespace-pre-wrap">
                      {i.resolution}: {h.resolution}
                    </p>
                  )}
                  <Muted>{` · ${h.actorType}${h.comment ? ` · ${h.comment}` : ''}`}</Muted>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <Muted>{all.ui.common.loading}</Muted>
      )}
      {row.lastComment && (
        <p className="text-sm">
          <strong>{i.legacyComment}: </strong>
          {row.lastComment}
        </p>
      )}
      {knowledge ? (
        <dl className="grid gap-4 md:grid-cols-2 text-sm">
          <div>
            <dt className="font-semibold">{i.rootCause}</dt>
            <dd className="whitespace-pre-wrap">{row.rootCause || '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold">{i.resolution}</dt>
            <dd className="whitespace-pre-wrap">{row.resolution || i.missingSolution}</dd>
          </div>
        </dl>
      ) : (
        <form
          className="flex max-w-2xl flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply(row);
          }}
        >
          <SelectField
            label={i.status}
            searchable={false}
            value={draft.target}
            onChange={(v) => setField(row.id, 'target', v)}
            placeholder="…"
            options={model.transitions(row)}
          />
          {draft.target === 'DUPLICATE' && (
            <SelectField
              label={i.duplicateOf}
              hint={hints.incidentsDuplicate}
              value={draft.duplicateOf}
              onChange={(v) => setField(row.id, 'duplicateOf', v)}
              placeholder="…"
              required
              options={others(row)}
            />
          )}
          <FormField label={i.rootCause}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={draft.rootCause}
                maxLength={2000}
                onChange={(e) => setField(row.id, 'rootCause', e.target.value)}
                required={draft.requiresCause}
                minLength={draft.requiresCause ? 3 : undefined}
              />
            )}
          </FormField>
          <FormField label={i.resolution}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={draft.resolution}
                maxLength={2000}
                onChange={(e) => setField(row.id, 'resolution', e.target.value)}
                required={draft.requiresSolution}
                minLength={draft.requiresSolution ? 3 : undefined}
              />
            )}
          </FormField>
          {draft.error && (
            <p role="alert" className="text-sm text-destructive">
              {draft.error}
            </p>
          )}
          <div>
            <Button type="submit" variant="success" disabled={busy}>
              {draft.target ? i.apply : i.save}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
