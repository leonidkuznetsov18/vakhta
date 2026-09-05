import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AcknowledgementStatusView,
  EmployeeView,
  OrgSnapshot,
  ScheduleVersionDetail,
  ScheduleVersionView,
  ShiftTemplateView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
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

const t = messages('ru');
const s = t.admin.schedule;
const EMPTY_GRID: GridState = { rows: [] };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Розділ «График»: фільтри площадка/підрозділ/місяць, версії з життєвим циклом
 * DRAFT → IN_REVIEW → PUBLISHED, сітка призначень і результат перевірок (ТЗ 3.2, 9.1).
 */
export function SchedulePage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [siteId, setSiteId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [templates, setTemplates] = useState<ShiftTemplateView[]>([]);
  const [versions, setVersions] = useState<ScheduleVersionView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScheduleVersionDetail | null>(null);
  const [acks, setAcks] = useState<AcknowledgementStatusView[] | null>(null);
  const [grid, setGrid] = useState<GridState>(EMPTY_GRID);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        const site = snapshot.sites[0];
        if (site) {
          setSiteId(site.id);
          const unit = snapshot.orgUnits.find((u) => u.siteId === site.id);
          if (unit) setOrgUnitId(unit.id);
        }
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
    setNotice(null);
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
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
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

  function returnToDraft() {
    if (!version) return;
    const comment = window.prompt(s.returnComment)?.trim();
    if (!comment) return;
    void run(async () => {
      await schedulesApi.returnToDraft(version.id, comment);
      await loadVersions(version.id);
      await loadDetail(version.id);
    }, s.returned);
  }

  function publish() {
    if (!version) return;
    if (!window.confirm(s.publishConfirm)) return;
    const reason = window.prompt(s.publishReason)?.trim();
    void run(async () => {
      await schedulesApi.publish(version.id, reason || undefined);
      await loadVersions(version.id);
      await loadDetail(version.id);
    }, s.published);
  }

  return (
    <section>
      <div className="toolbar">
        <label>
          <span>{s.site}</span>
          <select value={siteId} onChange={(e) => changeSite(e.target.value)} disabled={!org}>
            {org?.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{s.orgUnit}</span>
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} disabled={!org}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{s.month}</span>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
        <button type="button" className="btn" disabled={busy || !orgUnitId} onClick={createVersion}>
          {s.newVersion}
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {versions.length === 0 ? (
        <p className="muted">{s.noVersions}</p>
      ) : (
        <div className="versions" role="tablist">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === selectedId}
              className={v.id === selectedId ? 'active' : undefined}
              onClick={() => setSelectedId(v.id)}
            >
              {s.version} {v.versionNo}
              <span className={`status-badge ${v.status}`}>{s.statuses[v.status]}</span>
            </button>
          ))}
        </div>
      )}

      {version && detail && (
        <>
          {!editable && <p className="muted">{s.readOnlyHint}</p>}
          {templates.length === 0 && <p className="error">{s.noTemplates}</p>}

          <ScheduleGrid
            month={month}
            grid={grid}
            employees={employees}
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

          <div className="actions">
            {editable && (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !dirty}
                  onClick={save}
                >
                  {s.save} ({countShifts(grid)})
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || dirty || hasErrors}
                  onClick={submit}
                >
                  {s.submit}
                </button>
              </>
            )}
            {version.status === 'IN_REVIEW' && (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || hasErrors}
                  onClick={publish}
                >
                  {s.publish}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={returnToDraft}>
                  {s.returnToDraft}
                </button>
              </>
            )}
            {dirty && <span className="muted">{s.unsaved}</span>}
          </div>

          <h2>{s.issuesTitle}</h2>
          <IssuesPanel detail={detail} employees={employees} />

          {acks && (
            <>
              <h2>{s.ackTitle}</h2>
              <AckTable rows={acks} />
            </>
          )}
        </>
      )}
    </section>
  );
}
