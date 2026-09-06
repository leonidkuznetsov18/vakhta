import React, { useState } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { adminOrgApi } from '../api.ts';
import { Feedback, Field, useAction } from './ui.tsx';
import { currentLocale } from '../i18n.tsx';

const t = messages(currentLocale()).admin.administration;
const d = t.directories;
const ZONE_TYPES = ['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER'] as const;
type ZoneType = (typeof ZONE_TYPES)[number];

interface Props {
  readonly org: OrgSnapshot;
  readonly onChanged: () => Promise<void>;
}

/** Довідники підприємства: площадки, підрозділи, бригади, посади, зони (ТЗ 9.1). */
export function DirectoriesTab({ org, onChanged }: Props) {
  const { busy, error, notice, run } = useAction();
  const [site, setSite] = useState({ code: '', name: '', timezone: 'Europe/Moscow' });
  const [unit, setUnit] = useState({ siteId: org.sites[0]?.id ?? '', parentId: '', name: '' });
  const [team, setTeam] = useState({ orgUnitId: org.orgUnits[0]?.id ?? '', name: '' });
  const [position, setPosition] = useState({ code: '', name: '' });
  const [zone, setZone] = useState({
    orgUnitId: org.orgUnits[0]?.id ?? '',
    code: '',
    name: '',
    type: 'AREA' as ZoneType,
    isShared: false,
  });

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;
  const unitName = (id: string | null) =>
    id ? (org.orgUnits.find((u) => u.id === id)?.name ?? id) : '—';

  function submit(ev: React.FormEvent, action: () => Promise<unknown>, reset: () => void) {
    ev.preventDefault();
    void run(async () => {
      await action();
      await onChanged();
      reset();
    }, t.common.added);
  }

  return (
    <div className="directories">
      <Feedback error={error} notice={notice} />

      <h2>{d.sites}</h2>
      <ul className="list">
        {org.sites.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>{' '}
            <small className="muted">
              {s.code} · {s.timezone}
            </small>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) =>
          submit(
            ev,
            () => adminOrgApi.createSite(site),
            () => setSite({ ...site, code: '', name: '' }),
          )
        }
      >
        <Field label={t.common.code}>
          <input
            value={site.code}
            onChange={(ev) => setSite({ ...site, code: ev.target.value })}
            required
            pattern="[a-z0-9-]{2,32}"
          />
        </Field>
        <Field label={t.common.name}>
          <input
            value={site.name}
            onChange={(ev) => setSite({ ...site, name: ev.target.value })}
            required
          />
        </Field>
        <Field label={d.timezone}>
          <input
            value={site.timezone}
            onChange={(ev) => setSite({ ...site, timezone: ev.target.value })}
            required
          />
        </Field>
        <button type="submit" className="btn" disabled={busy}>
          {t.common.add}
        </button>
      </form>

      <h2>{d.orgUnits}</h2>
      <ul className="list">
        {org.orgUnits.map((u) => (
          <li key={u.id}>
            <strong>{u.name}</strong>{' '}
            <small className="muted">
              {siteName(u.siteId)}
              {u.parentId ? ` · ${unitName(u.parentId)}` : ''}
            </small>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) =>
          submit(
            ev,
            () =>
              adminOrgApi.createOrgUnit({
                siteId: unit.siteId,
                name: unit.name,
                parentId: unit.parentId || null,
              }),
            () => setUnit({ ...unit, name: '' }),
          )
        }
      >
        <Field label={t.common.site}>
          <select
            value={unit.siteId}
            onChange={(ev) => setUnit({ ...unit, siteId: ev.target.value, parentId: '' })}
            required
          >
            {org.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={d.parent}>
          <select
            value={unit.parentId}
            onChange={(ev) => setUnit({ ...unit, parentId: ev.target.value })}
          >
            <option value="">{t.common.none}</option>
            {org.orgUnits
              .filter((u) => u.siteId === unit.siteId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t.common.name}>
          <input
            value={unit.name}
            onChange={(ev) => setUnit({ ...unit, name: ev.target.value })}
            required
          />
        </Field>
        <button type="submit" className="btn" disabled={busy || !unit.siteId}>
          {t.common.add}
        </button>
      </form>

      <h2>{d.teams}</h2>
      <ul className="list">
        {org.teams.map((tm) => (
          <li key={tm.id}>
            <strong>{tm.name}</strong> <small className="muted">{unitName(tm.orgUnitId)}</small>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) =>
          submit(
            ev,
            () => adminOrgApi.createTeam(team),
            () => setTeam({ ...team, name: '' }),
          )
        }
      >
        <Field label={t.common.orgUnit}>
          <select
            value={team.orgUnitId}
            onChange={(ev) => setTeam({ ...team, orgUnitId: ev.target.value })}
            required
          >
            {org.orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.common.name}>
          <input
            value={team.name}
            onChange={(ev) => setTeam({ ...team, name: ev.target.value })}
            required
          />
        </Field>
        <button type="submit" className="btn" disabled={busy || !team.orgUnitId}>
          {t.common.add}
        </button>
      </form>

      <h2>{d.positions}</h2>
      <ul className="list">
        {org.positions.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> <small className="muted">{p.code}</small>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) =>
          submit(
            ev,
            () => adminOrgApi.createPosition(position),
            () => setPosition({ code: '', name: '' }),
          )
        }
      >
        <Field label={t.common.code}>
          <input
            value={position.code}
            onChange={(ev) => setPosition({ ...position, code: ev.target.value.toUpperCase() })}
            required
            pattern="[A-Z0-9_]{2,32}"
          />
        </Field>
        <Field label={t.common.name}>
          <input
            value={position.name}
            onChange={(ev) => setPosition({ ...position, name: ev.target.value })}
            required
          />
        </Field>
        <button type="submit" className="btn" disabled={busy}>
          {t.common.add}
        </button>
      </form>

      <h2>{d.zones}</h2>
      <ul className="list">
        {org.zones.map((z) => (
          <li key={z.id} className={z.isActive ? undefined : 'muted'}>
            <strong>{z.name}</strong>{' '}
            <small className="muted">
              {z.code} · {d.zoneTypes[z.type]} · {unitName(z.orgUnitId)}
              {z.isShared ? ` · ${d.shared}` : ''}
            </small>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) => {
          const unitRow = org.orgUnits.find((u) => u.id === zone.orgUnitId);
          if (!unitRow) return;
          submit(
            ev,
            () =>
              adminOrgApi.createZone({
                siteId: unitRow.siteId,
                orgUnitId: zone.orgUnitId,
                code: zone.code,
                name: zone.name,
                type: zone.type,
                isShared: zone.isShared,
              }),
            () => setZone({ ...zone, code: '', name: '' }),
          );
        }}
      >
        <Field label={t.common.orgUnit}>
          <select
            value={zone.orgUnitId}
            onChange={(ev) => setZone({ ...zone, orgUnitId: ev.target.value })}
            required
          >
            {org.orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.common.code}>
          <input
            value={zone.code}
            onChange={(ev) => setZone({ ...zone, code: ev.target.value.toUpperCase() })}
            required
            pattern="[A-Z0-9_]{2,32}"
          />
        </Field>
        <Field label={t.common.name}>
          <input
            value={zone.name}
            onChange={(ev) => setZone({ ...zone, name: ev.target.value })}
            required
          />
        </Field>
        <Field label={d.type}>
          <select
            value={zone.type}
            onChange={(ev) => setZone({ ...zone, type: ev.target.value as ZoneType })}
          >
            {ZONE_TYPES.map((zt) => (
              <option key={zt} value={zt}>
                {d.zoneTypes[zt]}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={zone.isShared}
            onChange={(ev) => setZone({ ...zone, isShared: ev.target.checked })}
          />
          <span>{d.shared}</span>
        </label>
        <button type="submit" className="btn" disabled={busy || !zone.orgUnitId}>
          {t.common.add}
        </button>
      </form>
    </div>
  );
}
