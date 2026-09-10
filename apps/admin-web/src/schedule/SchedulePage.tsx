import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScheduleVersionView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/app/confirm-dialog';
import { Feedback } from '@/components/app/feedback';
import { MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, Muted, Toolbar } from '@/components/app/page';
import { ApiError, schedulesApi } from '../api.ts';
import { readError } from '../errors.ts';
import {
  claimPresetVersion,
  clearSchedulePreset,
  PRESET_KEY,
  type SchedulePreset,
} from './preset.ts';
import { useScheduleDrafts } from './store.ts';
import { ScheduleGrid } from './ScheduleGrid.tsx';
import {
  addRow,
  countChanges,
  countShifts,
  gridFromDetail,
  gridToItems,
  removeRow,
  setCell,
  setZone,
  applyPattern,
  ROTATION_PATTERNS,
  type GridState,
  type RotationPattern,
} from './grid.ts';
import { currentLocale } from '../i18n.tsx';
import { useNavigation } from '../navigation.tsx';
import { usePersistentState } from '@/lib/ui-store';
import { useOrg, useEmployees } from '@/lib/org';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { formatDate, formatMonth } from '@/lib/format';
import { WandIcon } from 'lucide-react';
import { DateField } from '@/components/app/date-picker';
import { HowItWorks } from '@/components/app/how-it-works';
import { monthDates } from '@vakhta/domain';

const t = messages(currentLocale());
const s = t.admin.schedule;
const hints = t.ui.hints;
const EMPTY_GRID: GridState = { rows: [] };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * "Schedule" section: site/unit/month filters, versions with the lifecycle
 * DRAFT → IN_REVIEW → PUBLISHED, the assignment grid and validation results (spec 3.2, 9.1).
 */
export function SchedulePage() {
  const { org, error: orgError } = useOrg();
  const { employees, active: activeEmployees, error: employeesError } = useEmployees();
  const [storedSite, setStoredSite] = usePersistentState('schedule.siteId', '');
  const [storedUnit, setStoredUnit] = usePersistentState('schedule.orgUnitId', '');
  const [month, setMonth] = usePersistentState('schedule.month', currentMonth);
  const { confirm, dialog } = useConfirm();
  const { go, roles } = useNavigation();
  const canPublish = roles.includes('ADMIN') || roles.includes('PRODUCTION_HEAD');
  const client = useQueryClient();

  /**
   * The unit is the choice that matters, and it decides the site: a unit picked on another screen
   * — the overview sending us here — knows nothing about sites, and a remembered site that no
   * longer exists should not leave the page with no filters at all.
   */
  const unit = org?.orgUnits.find((u) => u.id === storedUnit) ?? null;
  const siteId =
    unit?.siteId ?? (org?.sites.find((x) => x.id === storedSite) ?? org?.sites[0])?.id ?? '';
  const units = org?.orgUnits.filter((u) => u.siteId === siteId) ?? [];
  const orgUnitId = unit?.id ?? units[0]?.id ?? '';
  const zones = org?.zones.filter((z) => z.orgUnitId === orgUnitId && z.isActive) ?? [];

  function changeSite(id: string) {
    setStoredSite(id);
    setStoredUnit(org?.orgUnits.find((u) => u.siteId === id)?.id ?? '');
  }

  const templatesQuery = useQuery({
    queryKey: keys.templates(siteId),
    queryFn: () => schedulesApi.templates(siteId),
    enabled: siteId !== '',
  });
  const templates = (templatesQuery.data ?? []).filter((tpl) => tpl.isActive);

  const listQuery = { siteId, orgUnitId, periodMonth: month };
  const versionsQuery = useQuery({
    queryKey: keys.schedules(listQuery),
    queryFn: () => schedulesApi.list(listQuery),
    enabled: siteId !== '' && orgUnitId !== '',
  });
  const versions = versionsQuery.data ?? [];
  const existingDraft = versions.find((v) => v.status === 'DRAFT') ?? null;

  /** Who the overview sent us here for, kept on screen until their month is saved. */
  const [preset] = usePersistentState<SchedulePreset | null>(PRESET_KEY, null);
  /** The preset still speaks about what is on screen (the master has not moved on). */
  const presetHere =
    preset !== null &&
    preset.month === month &&
    (preset.orgUnitId === null || preset.orgUnitId === orgUnitId);

  /**
   * The version on screen: the one asked for by hand while it is still in the list, otherwise the
   * draft the preset needs, otherwise the newest. Derived rather than remembered, so changing the
   * month cannot leave a version of another month selected.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId =
    (picked !== null && versions.some((v) => v.id === picked) ? picked : null) ??
    (presetHere ? (existingDraft?.id ?? null) : null) ??
    versions[0]?.id ??
    null;

  const detailQuery = useQuery({
    queryKey: keys.schedule(selectedId),
    queryFn: () => schedulesApi.detail(selectedId as string),
    enabled: selectedId !== null,
  });
  const detail = detailQuery.data ?? null;
  const version = detail?.version ?? null;
  // A published month is edited in place by those who can publish: saving makes a new version
  // and publishes it at once (the old one becomes history, employees are notified).
  const revising = version?.status === 'PUBLISHED' && canPublish;
  const editable = version?.status === 'DRAFT' || revising;

  /**
   * Three layers make the grid on screen, and only the last one is state: the version as the
   * server holds it, the people the overview sent us for on top of it, and — once anything is
   * touched — the unsaved month kept in the drafts store. Unsaved edits outlive the page: leaving
   * for another section unmounts it, and the version read back knows nothing about them.
   */
  const baseline = detail ? gridFromDetail(detail) : EMPTY_GRID;
  const withPreset =
    editable && presetHere && preset
      ? preset.people.reduce((g, person) => addRow(g, person.id), baseline)
      : baseline;
  const kept = useScheduleDrafts((st) => (version ? st.drafts[version.id] : undefined));
  const grid = kept ?? withPreset;
  /**
   * What a save would write differently from the version on the server. Everything the buttons and
   * the "unsaved" notice say is this number: touching the grid is not the same as changing it —
   * a row added with no shifts writes nothing at all.
   */
  const changes = countChanges(baseline, grid);

  function edit(next: (g: GridState) => GridState) {
    if (version) useScheduleDrafts.getState().keep(version.id, next(grid));
  }

  const reload = () => client.invalidateQueries({ queryKey: ['schedules'] });

  /**
   * A new draft for the month. Based on the given version (the one on screen, when the planner
   * wants to change a published schedule), otherwise on the published one, so the grid starts
   * from the current shifts instead of empty.
   */
  const create = useMutation({
    mutationFn: async (v: { basedOn?: ScheduleVersionView }) => {
      const source = v.basedOn ?? versions.find((x) => x.status === 'PUBLISHED');
      const created = await schedulesApi.create({
        siteId,
        orgUnitId,
        periodMonth: month,
        ...(source ? { basedOnVersionId: source.id } : {}),
      });
      // An answer without a version is broken, but the month may still have gained one — so read
      // the list back before deciding. Whatever the server really has is what the page should show;
      // only if nothing arrived is this a failure worth stopping on.
      if (!created?.id || typeof created.versionNo !== 'number') {
        const before = versions.map((x) => x.id);
        const appeared = (await schedulesApi.list(listQuery)).find((x) => !before.includes(x.id));
        if (!appeared) {
          throw new Error(
            `POST /admin/schedules answered without a version: ${JSON.stringify(created)}`,
          );
        }
        return { created: appeared, from: undefined };
      }
      return { created, from: source };
    },
    onSuccess: async ({ created, from }) => {
      setPicked(created.id);
      notifySuccess(
        from
          ? format(s.versionCreatedFrom, { no: created.versionNo, from: from.versionNo })
          : format(s.versionCreated, { no: created.versionNo }),
      );
      await reload();
    },
  });

  /**
   * The one effect on this page, and it is not a load: arriving from the overview is an
   * instruction formed on another screen, and carrying it out means a POST no query can make.
   * The claim lives in the store, so a remount never sends a second version request.
   */
  const token = `${siteId}|${orgUnitId}|${month}`;
  const needsVersion =
    presetHere && preset?.orgUnitId != null && versionsQuery.isSuccess && existingDraft === null;
  const startVersion = create.mutate;
  useEffect(() => {
    if (needsVersion && claimPresetVersion(token)) startVersion({});
  }, [needsVersion, token, startVersion]);

  const save = useMutation({
    mutationFn: (v: { id: string }) => schedulesApi.putAssignments(v.id, gridToItems(grid)),
    onSuccess: async (d) => {
      useScheduleDrafts.getState().drop(d.version.id);
      clearSchedulePreset();
      client.setQueryData(keys.schedule(d.version.id), d);
      notifySuccess(s.saved);
      await reload();
    },
  });

  const submit = useMutation({
    mutationFn: (v: { id: string }) => schedulesApi.submit(v.id),
    onSuccess: async () => {
      notifySuccess(s.submitted);
      await reload();
    },
  });

  const returnDraft = useMutation({
    mutationFn: (v: { id: string; comment: string }) => schedulesApi.returnToDraft(v.id, v.comment),
    onSuccess: async () => {
      notifySuccess(s.returned);
      await reload();
    },
  });

  const publish = useMutation({
    mutationFn: (v: { id: string; reason?: string | undefined }) =>
      schedulesApi.publish(v.id, v.reason),
    onSuccess: async () => {
      notifySuccess(s.published);
      await reload();
    },
  });

  const revise = useMutation({
    mutationFn: (v: { id: string; reason?: string | undefined }) =>
      schedulesApi.revise(v.id, gridToItems(grid), v.reason),
    onSuccess: async (created, v) => {
      useScheduleDrafts.getState().drop(v.id);
      setPicked(created.id);
      notifySuccess(format(s.revised, { no: created.versionNo }));
      await reload();
    },
  });

  const remove = useMutation({
    mutationFn: async (v: { id: string }) => {
      try {
        await schedulesApi.remove(v.id);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'SCHEDULE_VERSION_IN_USE')
          throw new Error(s.versionInUse);
        throw e;
      }
    },
    onSuccess: async (_r, v) => {
      useScheduleDrafts.getState().drop(v.id);
      setPicked(null);
      notifySuccess(s.deleted);
      await reload();
    },
  });

  const busy =
    create.isPending ||
    save.isPending ||
    submit.isPending ||
    returnDraft.isPending ||
    publish.isPending ||
    revise.isPending ||
    remove.isPending;
  const error = readError(
    orgError ??
      employeesError ??
      templatesQuery.error ??
      versionsQuery.error ??
      detailQuery.error ??
      create.error ??
      save.error ??
      submit.error ??
      returnDraft.error ??
      publish.error ??
      revise.error ??
      remove.error,
  );

  /**
   * The same version, asked for out loud. Nothing checks a month any more — not the rest between
   * shifts, not the hours, not a person standing in two units at once — so the one moment to say
   * that is before a version exists to be filled in.
   */
  async function confirmVersion(basedOn?: ScheduleVersionView) {
    const ok = await confirm({
      title: s.newVersion,
      description: format(s.newVersionConfirm, {
        month: formatMonth(month),
        unit: units.find((u) => u.id === orgUnitId)?.name ?? orgUnitId,
      }),
      confirmLabel: s.newVersionCreate,
    });
    if (ok === false) return;
    create.mutate(basedOn ? { basedOn } : {});
  }

  async function askReturnToDraft() {
    if (!version) return;
    const comment = await confirm({
      title: s.returnToDraft,
      description: hints.scheduleReturn,
      confirmLabel: s.returnToDraft,
      commentLabel: s.returnComment,
      commentRequired: true,
    });
    if (!comment) return;
    returnDraft.mutate({ id: version.id, comment });
  }

  async function askDelete() {
    if (!version) return;
    const ok = await confirm({
      title: s.deleteVersion,
      description: format(
        version.status === 'SUPERSEDED' ? s.deleteHistoryConfirm : s.deleteConfirm,
        { no: version.versionNo },
      ),
      confirmLabel: s.deleteVersion,
      destructive: true,
    });
    if (ok === false) return;
    remove.mutate({ id: version.id });
  }

  async function askPublishChanges() {
    if (!version) return;
    const reason = await confirm({
      title: s.publishChanges,
      description: s.reviseConfirm,
      confirmLabel: s.publishChanges,
      commentLabel: s.publishReason,
    });
    if (reason === false) return;
    revise.mutate({ id: version.id, reason: reason || undefined });
  }

  async function askPublish() {
    if (!version) return;
    const reason = await confirm({
      title: s.publish,
      description: s.publishConfirm,
      confirmLabel: s.publish,
      commentLabel: s.publishReason,
    });
    if (reason === false) return;
    publish.mutate({ id: version.id, reason: reason || undefined });
  }

  /** The rotation filler: whom for, which pattern, from which day of the month on screen. */
  const [patternFor, setPatternFor] = useState('');
  const [pattern, setPattern] = useState<RotationPattern>('DAY_2_2');
  const [startOverride, setStartOverride] = useState<{ month: string; date: string } | null>(null);
  const patternStart = startOverride?.month === month ? startOverride.date : `${month}-01`;
  const patternEmployee = grid.rows.some((r) => r.employeeId === patternFor) ? patternFor : '';

  function fillPattern() {
    const day = templates.find((tpl) => !tpl.isNight)?.id ?? '';
    const night = templates.find((tpl) => tpl.isNight)?.id ?? '';
    if (!patternEmployee || !day) return;
    edit((g) =>
      applyPattern(g, patternEmployee, monthDates(month), patternStart, pattern, { day, night }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="schedule" />
      <Toolbar>
        <SelectField
          label={s.site}
          value={siteId}
          onChange={changeSite}
          disabled={!org}
          options={org?.sites.map((site) => ({ value: site.id, label: site.name })) ?? []}
          className="w-56"
        />
        <SelectField
          label={s.orgUnit}
          value={orgUnitId}
          onChange={setStoredUnit}
          disabled={!org}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
          className="w-56"
        />
        <MonthField label={s.month} value={month} onChange={setMonth} className="w-48" />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !orgUnitId || activeEmployees.length === 0}
            onClick={() => void confirmVersion()}
          >
            {s.newVersion}
          </Button>
          <InfoTip text={hints.scheduleVersions} />
        </div>
      </Toolbar>

      <Feedback error={error} />

      {org && activeEmployees.length === 0 && (
        <Alert>
          <AlertTitle>{s.noEmployees}</AlertTitle>
          <AlertDescription>
            <Button type="button" variant="outline" size="sm" onClick={() => go('administration')}>
              {s.goToEmployees}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {org && orgUnitId && zones.length === 0 && (
        <Alert>
          <AlertTitle className="flex items-center gap-1">
            {s.zone}
            <InfoTip text={hints.scheduleZone} />
          </AlertTitle>
          <AlertDescription>
            <p>
              {format(s.noZonesInUnit, {
                unit: units.find((u) => u.id === orgUnitId)?.name ?? orgUnitId,
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                location.hash = '#/administration/directories';
                go('administration');
              }}
            >
              {s.openDirectories}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {versions.length === 0 ? (
        <EmptyState
          text={s.noVersions}
          action={
            <Button
              type="button"
              variant="outline"
              disabled={busy || !orgUnitId || activeEmployees.length === 0}
              onClick={() => void confirmVersion()}
            >
              {s.newVersion}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <SelectField
            label={s.version}
            hint={hints.scheduleVersions}
            value={selectedId ?? ''}
            onChange={(v) => v && setPicked(v)}
            options={[...versions]
              .sort((x, y) => y.versionNo - x.versionNo)
              .map((v) => ({
                value: v.id,
                label: format(s.versionOption, {
                  no: v.versionNo,
                  status: s.statuses[v.status],
                  date: formatDate(v.publishedAt ?? v.createdAt),
                }),
              }))}
            className="w-full sm:w-96"
          />
        </div>
      )}

      {version && detail && (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-base font-semibold">{formatMonth(month)}</h2>
            {version.status === 'IN_REVIEW' && <Muted>{s.readOnlyHint}</Muted>}
          </div>
          {revising && (
            <Alert>
              <AlertTitle className="flex items-center gap-1">
                {s.revisingTitle}
                <InfoTip text={hints.scheduleRevise} />
              </AlertTitle>
              <AlertDescription>
                <p>{s.revisingHint}</p>
                {existingDraft && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPicked(existingDraft.id)}
                  >
                    {format(s.openDraft, { no: existingDraft.versionNo })}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {((version.status === 'PUBLISHED' && !canPublish) || version.status === 'SUPERSEDED') && (
            <Alert>
              <AlertTitle className="flex items-center gap-1">
                {s.readOnlyHint}
                <InfoTip text={hints.scheduleEditPublished} />
              </AlertTitle>
              <AlertDescription>
                <p>{s.editPublishedHint}</p>
                {version.status === 'SUPERSEDED' && version.deletable && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void askDelete()}
                  >
                    {s.deleteVersion}
                  </Button>
                )}
                {existingDraft ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPicked(existingDraft.id)}
                  >
                    {format(s.openDraft, { no: existingDraft.versionNo })}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || activeEmployees.length === 0}
                    onClick={() => void confirmVersion(version)}
                  >
                    {s.editPublished}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {templates.length === 0 && <Feedback error={s.noTemplates} notice={null} />}

          {editable && grid.rows.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
              <SelectField
                label={s.employee}
                value={patternEmployee}
                onChange={setPatternFor}
                placeholder="…"
                options={grid.rows.map((r) => ({
                  value: r.employeeId,
                  label: employees.find((e) => e.id === r.employeeId)?.fullName ?? r.employeeId,
                }))}
                className="w-64"
              />
              <SelectField
                label={s.pattern}
                hint={hints.schedulePattern}
                value={pattern}
                onChange={(v) => setPattern(v as RotationPattern)}
                options={ROTATION_PATTERNS.map((p) => ({ value: p, label: s.patterns[p] }))}
                className="w-56"
              />
              <DateField
                label={s.patternStart}
                value={patternStart}
                onChange={(date) => setStartOverride({ month, date })}
                className="w-44"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !patternEmployee}
                onClick={fillPattern}
              >
                <WandIcon aria-hidden="true" />
                {s.patternApply}
              </Button>
            </div>
          )}

          <ScheduleGrid
            month={month}
            grid={grid}
            employees={activeEmployees}
            templates={templates}
            zones={zones}
            readOnly={!editable || busy}
            onCell={(emp, date, tpl) => edit((g) => setCell(g, emp, date, tpl))}
            onZone={(emp, zone) => edit((g) => setZone(g, emp, zone))}
            onAdd={(emp) => edit((g) => addRow(g, emp))}
            onRemove={(emp) => edit((g) => removeRow(g, emp))}
          />

          <div className="flex flex-wrap items-center gap-2">
            {revising && (
              <>
                <Button
                  type="button"
                  disabled={busy || changes === 0}
                  onClick={() => void askPublishChanges()}
                >
                  {s.publishChanges} ({changes})
                </Button>
                <InfoTip text={hints.scheduleRevise} />
                {changes > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => useScheduleDrafts.getState().drop(version.id)}
                  >
                    {s.discardChanges}
                  </Button>
                )}
              </>
            )}
            {editable && !revising && (
              <>
                {/* What the button is about to write, not how big the month is: on a version that
                    already holds two hundred shifts, "Save (200)" for one edited cell counted the
                    month rather than the work — and with nothing to write it stays shut. */}
                <Button
                  type="button"
                  disabled={busy || changes === 0}
                  onClick={() => save.mutate({ id: version.id })}
                >
                  {s.save} ({changes})
                </Button>
                {/* An empty month is refused by the server (SCHEDULE_EMPTY), so the button says
                    so first instead of spending a round trip on a 422. */}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || changes > 0 || countShifts(grid) === 0}
                  onClick={() => submit.mutate({ id: version.id })}
                >
                  {s.submit}
                </Button>
                <InfoTip text={hints.scheduleSubmit} />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void askDelete()}
                >
                  {s.deleteVersion}
                </Button>
                <InfoTip text={hints.scheduleDelete} />
              </>
            )}
            {version.status === 'IN_REVIEW' && (
              <>
                <Button type="button" disabled={busy} onClick={() => void askPublish()}>
                  {s.publish}
                </Button>
                <InfoTip text={hints.schedulePublish} />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void askReturnToDraft()}
                >
                  {s.returnToDraft}
                </Button>
              </>
            )}
            {changes > 0 && <Muted>{s.unsaved}</Muted>}
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}
