import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AcknowledgementStatusView,
  EmployeeView,
  OrgSnapshot,
  ScheduleVersionDetail,
  ScheduleVersionView,
  ShiftTemplateView,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/app/confirm-dialog';
import { Feedback } from '@/components/app/feedback';
import { MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { employeesApi, orgApi, schedulesApi } from '../api.ts';
import { describeError as describe } from '../errors.ts';
import { AckTable } from './AckTable.tsx';
import { IssuesPanel } from './IssuesPanel.tsx';
import { ScheduleGrid } from './ScheduleGrid.tsx';
import {
  addRow,
  countShifts,
  gridFromDetail,
  gridToItems,
  removeRow,
  setCell,
  setZone,
  type GridState,
} from './grid.ts';
import { currentLocale } from '../i18n.tsx';
import { useNavigation } from '../navigation.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { notifySuccess } from '@/lib/toast';
import { formatDate, formatMonth } from '@/lib/format';

const t = messages(currentLocale());
const s = t.admin.schedule;
const hints = t.ui.hints;
const EMPTY_GRID: GridState = { rows: [] };
const STATUS_TONE: Record<ScheduleVersionView['status'], Tone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'info',
  PUBLISHED: 'success',
  SUPERSEDED: 'warning',
  CLOSED: 'neutral',
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * "Schedule" section: site/unit/month filters, versions with the lifecycle
 * DRAFT → IN_REVIEW → PUBLISHED, the assignment grid and validation results (spec 3.2, 9.1).
 */
export function SchedulePage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [siteId, setSiteId] = usePersistentState('schedule.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('schedule.orgUnitId', '');
  const [month, setMonth] = usePersistentState('schedule.month', currentMonth);
  const [templates, setTemplates] = useState<ShiftTemplateView[]>([]);
  const [versions, setVersions] = useState<ScheduleVersionView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScheduleVersionDetail | null>(null);
  const [acks, setAcks] = useState<AcknowledgementStatusView[] | null>(null);
  const [grid, setGrid] = useState<GridState>(EMPTY_GRID);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const { go } = useNavigation();
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'ACTIVE'),
    [employees],
  );

  const units = useMemo(
    () => org?.orgUnits.filter((u) => u.siteId === siteId) ?? [],
    [org, siteId],
  );
  const zones = useMemo(
    () => org?.zones.filter((z) => z.orgUnitId === orgUnitId && z.isActive) ?? [],
    [org, orgUnitId],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([orgApi.snapshot(), employeesApi.list()])
      .then(([snapshot, list]) => {
        if (!alive) return;
        setOrg(snapshot);
        setEmployees(list);
        // Keep the remembered filters when they still exist, otherwise fall back to the first ones.
        setSiteId((cur) => {
          const site = snapshot.sites.find((x) => x.id === cur) ?? snapshot.sites[0];
          if (!site) return '';
          setOrgUnitId((unit) =>
            snapshot.orgUnits.some((u) => u.id === unit && u.siteId === site.id)
              ? unit
              : (snapshot.orgUnits.find((u) => u.siteId === site.id)?.id ?? ''),
          );
          return site.id;
        });
      })
      .catch((e: unknown) => alive && setError(describe(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    schedulesApi
      .templates(siteId)
      .then((list) => alive && setTemplates(list.filter((tpl) => tpl.isActive)))
      .catch((e: unknown) => alive && setError(describe(e)));
    return () => {
      alive = false;
    };
  }, [siteId]);

  const loadVersions = useCallback(
    async (preferId?: string) => {
      if (!siteId || !orgUnitId) return;
      const list = await schedulesApi.list({ siteId, orgUnitId, periodMonth: month });
      setVersions(list);
      const pick =
        preferId && list.some((v) => v.id === preferId) ? preferId : (list[0]?.id ?? null);
      setSelectedId(pick);
    },
    [siteId, orgUnitId, month],
  );

  useEffect(() => {
    setDetail(null);
    setAcks(null);
    setGrid(EMPTY_GRID);
    setDirty(false);
    loadVersions().catch((e: unknown) => setError(describe(e)));
  }, [loadVersions]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await schedulesApi.detail(id);
    setDetail(d);
    setGrid(gridFromDetail(d));
    setDirty(false);
    setAcks(d.version.status === 'PUBLISHED' ? await schedulesApi.acknowledgements(id) : null);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setGrid(EMPTY_GRID);
      return;
    }
    let alive = true;
    loadDetail(selectedId).catch((e: unknown) => alive && setError(describe(e)));
    return () => {
      alive = false;
    };
  }, [selectedId, loadDetail]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (done) notifySuccess(done);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  const version = detail?.version ?? null;
  const editable = version?.status === 'DRAFT';
  const hasErrors = detail?.issues.some((i) => i.severity === 'ERROR') ?? false;

  function changeSite(id: string) {
    setSiteId(id);
    const unit = org?.orgUnits.find((u) => u.siteId === id);
    setOrgUnitId(unit?.id ?? '');
  }

  function createVersion() {
    const published = versions.find((v) => v.status === 'PUBLISHED');
    void run(async () => {
      const created = await schedulesApi.create({
        siteId,
        orgUnitId,
        periodMonth: month,
        ...(published ? { basedOnVersionId: published.id } : {}),
      });
      await loadVersions(created.id);
    });
  }

  function save() {
    if (!version) return;
    void run(async () => {
      const d = await schedulesApi.putAssignments(version.id, gridToItems(grid));
      setDetail(d);
      setGrid(gridFromDetail(d));
      setDirty(false);
      setVersions((list) => list.map((v) => (v.id === d.version.id ? d.version : v)));
    }, s.saved);
  }

  function submit() {
    if (!version) return;
    void run(async () => {
      await schedulesApi.submit(version.id);
      await loadVersions(version.id);
      await loadDetail(version.id);
    }, s.submitted);
  }

  async function returnToDraft() {
    if (!version) return;
    const comment = await confirm({
      title: s.returnToDraft,
      description: hints.scheduleReturn,
      confirmLabel: s.returnToDraft,
      commentLabel: s.returnComment,
      commentRequired: true,
    });
    if (!comment) return;
    void run(async () => {
      await schedulesApi.returnToDraft(version.id, comment);
      await loadVersions(version.id);
      await loadDetail(version.id);
    }, s.returned);
  }

  async function deleteVersion() {
    if (!version) return;
    const ok = await confirm({
      title: s.deleteVersion,
      description: format(s.deleteConfirm, { no: version.versionNo }),
      confirmLabel: s.deleteVersion,
      destructive: true,
    });
    if (ok === false) return;
    void run(async () => {
      await schedulesApi.remove(version.id);
      setSelectedId(null);
      await loadVersions();
    }, s.deleted);
  }

  async function publish() {
    if (!version) return;
    const reason = await confirm({
      title: s.publish,
      description: s.publishConfirm,
      confirmLabel: s.publish,
      commentLabel: s.publishReason,
    });
    if (reason === false) return;
    void run(async () => {
      await schedulesApi.publish(version.id, reason || undefined);
      await loadVersions(version.id);
      await loadDetail(version.id);
    }, s.published);
  }

  return (
    <div className="flex flex-col gap-4">
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
          onChange={setOrgUnitId}
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
            onClick={createVersion}
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

      {versions.length === 0 ? (
        <EmptyState
          text={s.noVersions}
          action={
            <Button
              type="button"
              variant="outline"
              disabled={busy || !orgUnitId || activeEmployees.length === 0}
              onClick={createVersion}
            >
              {s.newVersion}
            </Button>
          }
        />
      ) : (
        <Tabs value={selectedId ?? ''} onValueChange={(v) => setSelectedId(v)}>
          <TabsList>
            {versions.map((v) => (
              <TabsTrigger key={v.id} value={v.id} className="gap-2">
                <span className="font-medium">
                  {s.version} {v.versionNo}
                </span>
                <StatusPill tone={STATUS_TONE[v.status]}>{s.statuses[v.status]}</StatusPill>
                <Muted className="hidden text-xs sm:inline">
                  {format(s.createdOn, { date: formatDate(v.publishedAt ?? v.createdAt) })}
                </Muted>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {version && detail && (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-base font-semibold">{formatMonth(month)}</h2>
            {!editable && <Muted>{s.readOnlyHint}</Muted>}
          </div>
          {templates.length === 0 && <Feedback error={s.noTemplates} notice={null} />}

          <ScheduleGrid
            month={month}
            grid={grid}
            employees={activeEmployees}
            templates={templates}
            zones={zones}
            readOnly={!editable || busy}
            onCell={(emp, date, tpl) => {
              setGrid((g) => setCell(g, emp, date, tpl));
              setDirty(true);
            }}
            onZone={(emp, zone) => {
              setGrid((g) => setZone(g, emp, zone));
              setDirty(true);
            }}
            onAdd={(emp) => {
              setGrid((g) => addRow(g, emp));
              setDirty(true);
            }}
            onRemove={(emp) => {
              setGrid((g) => removeRow(g, emp));
              setDirty(true);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <Button type="button" disabled={busy || !dirty} onClick={save}>
                  {s.save} ({countShifts(grid)})
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || dirty || hasErrors}
                  onClick={submit}
                >
                  {s.submit}
                </Button>
                <InfoTip text={hints.scheduleSubmit} />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void deleteVersion()}
                >
                  {s.deleteVersion}
                </Button>
                <InfoTip text={hints.scheduleDelete} />
              </>
            )}
            {version.status === 'IN_REVIEW' && (
              <>
                <Button type="button" disabled={busy || hasErrors} onClick={() => void publish()}>
                  {s.publish}
                </Button>
                <InfoTip text={hints.schedulePublish} />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void returnToDraft()}
                >
                  {s.returnToDraft}
                </Button>
              </>
            )}
            {dirty && <Muted>{s.unsaved}</Muted>}
          </div>

          <Section title={s.issuesTitle} hint={hints.scheduleIssues}>
            <IssuesPanel detail={detail} employees={employees} />
          </Section>

          {acks && (
            <Section title={s.ackTitle} hint={hints.scheduleAck}>
              <AckTable rows={acks} />
            </Section>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}
