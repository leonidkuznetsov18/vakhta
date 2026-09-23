import { shiftTemplateLabel } from '@/entities/shift-template';
import { useState } from 'react';
import { SendIcon, UserCheckIcon, Undo2Icon, BanIcon } from 'lucide-react';
import type { OpenSlotView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/app/fields';
import { Feedback } from '@/components/app/feedback';
import { QueryFeedback } from '@/components/app/query-feedback';
import { InfoTip } from '@/components/app/info-tip';
import { readError } from '@/errors';
import { recordedTime } from '../lib/labels';
import type { Workspace } from '../model/use-workspace';
import type { OpenSlots } from '../model/use-open-slots';
import { reasonText, useCandidates } from '../model/use-eligibility';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;

/**
 * One open slot (SC-15/SC-16): internal until deliberately offered; responses are listed with the
 * same eligibility reasons as candidates; one authorized selection fills the slot in the draft.
 */
export function SlotDetails({
  workspace: w,
  slot,
  slots,
  onDone,
}: {
  readonly workspace: Workspace;
  readonly slot: OpenSlotView;
  readonly slots: OpenSlots;
  readonly onDone: () => void;
}) {
  const [audience, setAudience] = useState<'UNIT' | 'ALL'>('UNIT');
  const template = w.templates.find((item) => item.id === slot.templateId);
  const zone = w.zones.find((item) => item.id === slot.zoneId);
  const manage = w.writable && w.rights.edit;
  const draftReady = !!w.version && w.version.status === 'DRAFT' && w.writable && w.changes === 0;
  const candidates = useCandidates(
    w.accessKey,
    {
      siteId: w.siteId,
      orgUnitId: w.orgUnitId,
      zoneId: slot.zoneId,
      templateId: slot.templateId,
      businessDate: slot.businessDate,
    },
    slot.status === 'OFFERED',
  );
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((item) => item.id === id)?.name ?? id,
    employeeName: (id: string) => employeeLabel(w, id),
  };
  const interested = slot.offer?.interests.filter((item) => item.response === 'INTERESTED') ?? [];
  const status =
    slot.status === 'OPEN'
      ? t.slotInternal
      : slot.status === 'OFFERED'
        ? format(t.slotOfferedState, { count: interested.length })
        : slot.status === 'FILLED'
          ? format(t.slotFilledBy, { name: employeeLabel(w, slot.filledEmployeeId ?? '') })
          : t.slotCancelledState;
  const error =
    slots.offer.error ?? slots.withdraw.error ?? slots.cancel.error ?? slots.select.error;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <h3 className="font-semibold">{t.openSlot}</h3>
        <InfoTip text={t.openSlotsHint} />
      </div>
      <p className="text-sm">
        {slot.businessDate} · {template ? shiftTemplateLabel(template, t) : t.unknownTemplate}
        {template ? ` · ${template.localStart}–${template.localEnd}` : ''} ·{' '}
        {zone?.name ?? t.noZone}
      </p>
      <p className="text-sm">{status}</p>
      {slot.offer && (
        <p className="text-sm text-muted-foreground">
          {format(t.slotNotified, {
            date: recordedTime(slot.offer.offeredAt, w.timezone),
            count: slot.offer.notifiedCount,
          })}
        </p>
      )}
      {error && <Feedback error={readError(error)} />}
      {slot.status === 'OPEN' && manage && (
        <div className="space-y-2 rounded-md border p-3">
          <SelectField
            label={t.offerAudience}
            value={audience}
            onChange={(value) => setAudience(value === 'ALL' ? 'ALL' : 'UNIT')}
            options={[
              { value: 'UNIT', label: t.audienceUnit },
              { value: 'ALL', label: t.audienceAll },
            ]}
          />
          <Button
            disabled={slots.busy}
            onClick={() => slots.offer.mutate({ id: slot.id, command: { audience } })}
          >
            <SendIcon aria-hidden="true" />
            {t.offerSlot}
          </Button>
        </div>
      )}
      {slot.status === 'OFFERED' && (
        <section className="space-y-2" aria-label={t.responses}>
          <div className="flex items-center gap-1">
            <h4 className="text-sm font-semibold">{t.responses}</h4>
            <InfoTip text={t.slotSelectHint} />
          </div>
          {slot.offer && slot.offer.interests.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.noResponses}</p>
          )}
          {interested.length > 0 && <QueryFeedback query={candidates} />}
          {manage && !draftReady && interested.length > 0 && (
            <p className="text-sm text-muted-foreground">{t.slotNeedsDraft}</p>
          )}
          <ul className="space-y-1 text-sm">
            {(slot.offer?.interests ?? []).map((item) => {
              const candidate = candidates.data?.find(
                (value) => value.employeeId === item.employeeId,
              );
              const blocked = candidate?.status === 'BLOCKED';
              // Eligibility must be known before a person can fill the slot.
              const canSelect =
                draftReady && !!w.version && candidates.isSuccess && !blocked && !slots.busy;
              return (
                <li
                  key={item.employeeId}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium [overflow-wrap:anywhere]">
                      {employeeLabel(w, item.employeeId)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.response === 'INTERESTED' ? t.interested : t.declined} ·{' '}
                      {recordedTime(item.respondedAt, w.timezone)}
                      {candidate && candidate.reasons.length > 0
                        ? ` · ${candidate.reasons.map((reason) => reasonText(reason, labels)).join(' · ')}`
                        : ''}
                    </span>
                  </span>
                  {manage && item.response === 'INTERESTED' && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                      disabled={!canSelect}
                      onClick={() => {
                        if (!w.version || !canSelect) return;
                        slots.select.mutate(
                          {
                            id: slot.id,
                            command: {
                              employeeId: item.employeeId,
                              versionId: w.version.id,
                              expectedRevision: w.version.revision,
                            },
                          },
                          { onSuccess: onDone },
                        );
                      }}
                    >
                      <UserCheckIcon aria-hidden="true" />
                      {t.selectCandidate}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {manage && (slot.status === 'OPEN' || slot.status === 'OFFERED') && (
        <div className="flex flex-wrap gap-2">
          {slot.status === 'OFFERED' && (
            <Button
              variant="outline"
              disabled={slots.busy}
              onClick={() => slots.withdraw.mutate(slot.id)}
            >
              <Undo2Icon aria-hidden="true" />
              {t.withdrawOffer}
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={slots.busy}
            onClick={() => slots.cancel.mutate(slot.id, { onSuccess: onDone })}
          >
            <BanIcon aria-hidden="true" />
            {t.cancelSlot}
          </Button>
        </div>
      )}
    </div>
  );
}
