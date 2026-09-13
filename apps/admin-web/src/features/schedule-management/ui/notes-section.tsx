import { useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField, SelectField } from '@/components/app/fields';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { ScrollableText } from '@/components/app/row-detail';
import { IconButton } from '@/shared/ui/icon-button';
import { readError } from '@/errors';
import { recordedTime } from '../lib/labels';
import type { Workspace } from '../model/use-workspace';
import { notesFor, type Notes } from '../model/use-notes';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;
const APPROVERS = ['ADMIN', 'PRODUCTION_HEAD'];
const LONG = 240;

/** Notes for a date, zone or person with an explicit audience (SC-39); long text stays bounded. */
export function NotesSection({
  workspace: w,
  notes,
  date,
  zoneId = null,
  employeeId = null,
}: {
  readonly workspace: Workspace;
  readonly notes: Notes;
  readonly date: string;
  readonly zoneId?: string | null;
  readonly employeeId?: string | null;
}) {
  const navigation = useNavigation();
  const [draft, setDraft] = useState({
    text: '',
    audience: 'PLANNERS' as 'PLANNERS' | 'EMPLOYEES',
    scope: 'date' as 'date' | 'zone' | 'person',
  });
  const visible = notesFor(notes.notes, { date, zoneId, employeeId });
  const canWrite = w.rights.edit || w.rights.publish;
  const approver = navigation.roles.some((role) => APPROVERS.includes(role));
  const zoneName = (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id;
  const audienceLabel = (audience: 'PLANNERS' | 'EMPLOYEES') =>
    audience === 'EMPLOYEES' ? t.audienceEmployees : t.audiencePlanners;
  const text = draft.text.trim();
  const canAdd = canWrite && text.length > 0 && text.length <= 2000 && !notes.busy;
  const scopeOptions = [
    { value: 'date', label: t.noteScopeDate },
    ...(zoneId ? [{ value: 'zone', label: t.noteScopeZone }] : []),
    ...(employeeId ? [{ value: 'person', label: t.noteScopePerson }] : []),
  ];
  return (
    <section className="space-y-2" aria-label={t.notes}>
      <div className="flex items-center gap-1">
        <h4 className="text-sm font-semibold">{t.notes}</h4>
        <InfoTip text={t.notesHint} />
      </div>
      {notes.query.isError && <Feedback error={readError(notes.query.error)} />}
      {visible.length === 0 && !notes.query.isError && (
        <p className="text-sm text-muted-foreground">{t.noNotes}</p>
      )}
      <ul className="space-y-2">
        {visible.map((note) => (
          <li key={note.id} className="rounded-md border p-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {format(t.noteBy, {
                  audience: audienceLabel(note.audience),
                  time: recordedTime(note.createdAt, w.timezone),
                })}
                {note.zoneId ? ` · ${zoneName(note.zoneId)}` : ''}
                {note.employeeId ? ` · ${employeeLabel(w, note.employeeId)}` : ''}
                {note.businessDate === null ? ` · ${w.month}` : ''}
              </span>
              {canWrite && (note.createdBy === navigation.actorId || approver) && (
                <IconButton
                  icon={Trash2Icon}
                  label={t.removeNote}
                  tooltip={t.removeNote}
                  variant="ghost"
                  size="icon"
                  disabled={notes.busy}
                  onClick={() => notes.remove.mutate(note.id)}
                />
              )}
            </div>
            {note.text.length > LONG ? (
              <ScrollableText label={t.noteText} text={note.text} />
            ) : (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
            )}
          </li>
        ))}
      </ul>
      {(notes.create.error ?? notes.remove.error) && (
        <Feedback error={readError(notes.create.error ?? notes.remove.error)} />
      )}
      {canWrite && (
        <form
          className="space-y-2 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canAdd) return;
            notes.create.mutate(
              {
                siteId: w.siteId,
                orgUnitId: w.orgUnitId,
                periodMonth: w.month,
                businessDate: date,
                zoneId: draft.scope === 'zone' ? (zoneId ?? null) : null,
                employeeId: draft.scope === 'person' ? (employeeId ?? null) : null,
                audience: draft.audience,
                text,
              },
              { onSuccess: () => setDraft({ ...draft, text: '' }) },
            );
          }}
        >
          <FormField label={t.noteText}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                maxLength={2000}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              />
            )}
          </FormField>
          <div className="grid gap-2 @min-[26rem]:grid-cols-2">
            <SelectField
              label={t.noteAudience}
              value={draft.audience}
              onChange={(value) =>
                setDraft({ ...draft, audience: value === 'EMPLOYEES' ? 'EMPLOYEES' : 'PLANNERS' })
              }
              options={[
                { value: 'PLANNERS', label: t.audiencePlanners },
                { value: 'EMPLOYEES', label: t.audienceEmployees },
              ]}
            />
            <SelectField
              label={t.noteScope}
              value={draft.scope}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  scope: value === 'zone' ? 'zone' : value === 'person' ? 'person' : 'date',
                })
              }
              options={scopeOptions}
            />
          </div>
          <Button type="submit" size="sm" disabled={!canAdd}>
            <PlusIcon aria-hidden="true" />
            {t.addNote}
          </Button>
        </form>
      )}
    </section>
  );
}
