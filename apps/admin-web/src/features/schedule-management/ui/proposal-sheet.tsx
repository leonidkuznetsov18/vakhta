import { shiftTemplateLabel } from '@/entities/shift-template';
import { useState } from 'react';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectField } from '@/components/app/fields';
import { Feedback } from '@/components/app/feedback';
import { QueryFeedback } from '@/components/app/query-feedback';
import { InfoTip } from '@/components/app/info-tip';
import { CalendarDetailPanel } from '@/shared/ui/resource-calendar';
import { readError } from '@/errors';
import type { Workspace } from '../model/use-workspace';
import type { OpenSlots } from '../model/use-open-slots';
import { proposalModel } from '../model/proposal';
import { reasonText } from '../model/use-eligibility';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;

/** Explainable allocation proposal over open slots (SC-45); a person reviews, edits and applies. */
export function ProposalSheet({
  workspace: w,
  slots,
  open,
  onClose,
  onRestoreFocus,
}: {
  readonly workspace: Workspace;
  readonly slots: OpenSlots;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
}) {
  const [cohort, setCohort] = useState<'unit' | 'site'>('unit');
  const [preferOwnUnit, setPreferOwnUnit] = useState(true);
  const [balanceHours, setBalanceHours] = useState(true);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [outcome, setOutcome] = useState<{
    applied: number;
    failed: number;
    error: unknown;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const result = proposalModel({
    workspace: w,
    slots: slots.slots,
    cohort,
    preferences: { preferOwnUnit, balanceHours },
  });
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
    employeeName: (id: string) => employeeLabel(w, id),
  };
  const slotLabel = (id: string) => {
    const slot = slots.slots.find((item) => item.id === id);
    const template = slot ? w.templates.find((item) => item.id === slot.templateId) : undefined;
    return slot
      ? `${slot.businessDate} · ${template ? shiftTemplateLabel(template, t) : ''} · ${labels.zoneName(slot.zoneId)}`
      : id;
  };
  const kept = result.picks.filter((pick) => !skipped.has(pick.slotId));
  const draftReady = !!w.version && w.version.status === 'DRAFT' && w.writable && w.changes === 0;
  const canApply =
    draftReady && slots.query.isSuccess && result.ready && kept.length > 0 && !applying;
  async function apply() {
    if (!w.version || !canApply) return;
    setApplying(true);
    let revision = w.version.revision;
    let applied = 0;
    let failed = 0;
    let error: unknown = null;
    for (const pick of kept) {
      try {
        const response = await slots.select.mutateAsync({
          id: pick.slotId,
          command: {
            employeeId: pick.employeeId,
            versionId: w.version.id,
            expectedRevision: revision,
          },
        });
        revision = response.detail.version.revision;
        applied += 1;
      } catch (caught) {
        failed += 1;
        error = caught;
        break;
      }
    }
    setApplying(false);
    setOutcome({ applied, failed: failed + (kept.length - applied - failed), error });
  }
  return (
    <CalendarDetailPanel
      open={open}
      title={t.proposal}
      description={format(t.proposalScope, {
        slots: result.scope.slots,
        dates: result.scope.dates.length
          ? `${result.scope.dates[0]} – ${result.scope.dates.at(-1)}`
          : '—',
        people: result.scope.people,
      })}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t.proposalCohort}
            value={cohort}
            onChange={(value) => setCohort(value === 'site' ? 'site' : 'unit')}
            options={[
              { value: 'unit', label: t.cohortUnit },
              { value: 'site', label: t.cohortSite },
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={preferOwnUnit}
              onCheckedChange={(value) => setPreferOwnUnit(value === true)}
            />
            {t.preferOwnUnit}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={balanceHours}
              onCheckedChange={(value) => setBalanceHours(value === true)}
            />
            {t.balanceHours}
          </label>
          <InfoTip text={t.proposalHint} />
        </div>
        <QueryFeedback query={slots.query} />
        {slots.query.isSuccess && result.scope.slots === 0 && (
          <p className="text-sm text-muted-foreground">{t.proposalNothing}</p>
        )}
        {result.picks.length > 0 && (
          <section className="space-y-2" aria-label={t.proposalPicks}>
            <h4 className="text-sm font-semibold">{t.proposalPicks}</h4>
            <ul className="space-y-1 text-sm">
              {result.picks.map((pick) => {
                const off = skipped.has(pick.slotId);
                return (
                  <li
                    key={pick.slotId}
                    className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${off ? 'opacity-60' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {slotLabel(pick.slotId)} → {employeeLabel(w, pick.employeeId)}
                      </span>
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {format(t.proposalAlternatives, { count: pick.alternatives })}
                        {pick.warnings.length > 0
                          ? ` · ${pick.warnings.map((reason) => reasonText(reason, labels)).join(' · ')}`
                          : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSkipped((current) => {
                          const next = new Set(current);
                          if (off) next.delete(pick.slotId);
                          else next.add(pick.slotId);
                          return next;
                        })
                      }
                    >
                      {off ? t.keepPick : t.skipPick}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {result.unresolved.length > 0 && (
          <section className="space-y-1" aria-label={t.proposalUnresolved}>
            <h4 className="text-sm font-semibold">{t.proposalUnresolved}</h4>
            <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
              {result.unresolved.map((item) => (
                <li key={item.slotId}>
                  {slotLabel(item.slotId)} ·{' '}
                  {item.reason === 'NO_PEOPLE' ? t.unresolvedNoPeople : t.unresolvedAllBlocked}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!draftReady && result.picks.length > 0 && (
          <p className="text-sm text-muted-foreground">{t.slotNeedsDraft}</p>
        )}
        {outcome && outcome.error != null && <Feedback error={readError(outcome.error)} />}
        {outcome && outcome.error == null && (
          <p role="status" className="text-sm">
            {format(t.proposalApplied, { count: outcome.applied, failed: outcome.failed })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canApply} onClick={() => void apply()}>
            {format(t.applyProposal, { count: kept.length })}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </CalendarDetailPanel>
  );
}
