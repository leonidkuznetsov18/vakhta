import { useState, type FormEvent } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill } from '@/components/app/page';
import { adminOrgApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const d = t.directories;
const hints = all.ui.hints;
const ZONE_TYPES = ['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER'] as const;
type ZoneType = (typeof ZONE_TYPES)[number];

interface Props {
  readonly org: OrgSnapshot;
  readonly onChanged: () => Promise<void>;
}

/** Enterprise directories: sites, units, teams, positions, zones (spec 9.1). */
export function DirectoriesTab({ org, onChanged }: Props) {
  const { busy, error, notice, run } = useAction();
  const [site, setSite] = useState({ code: '', name: '', timezone: 'Europe/Kyiv' });
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

  function submit(ev: FormEvent, action: () => Promise<unknown>, reset: () => void) {
    ev.preventDefault();
    void run(async () => {
      await action();
      await onChanged();
      reset();
    }, t.common.added);
  }

  const siteColumns: Column<OrgSnapshot['sites'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (s) => s.name },
    { key: 'code', header: t.common.code, cell: (s) => <code className="text-xs">{s.code}</code> },
    { key: 'tz', header: d.timezone, cell: (s) => s.timezone },
  ];
  const unitColumns: Column<OrgSnapshot['orgUnits'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (u) => u.name },
    { key: 'site', header: t.common.site, cell: (u) => siteName(u.siteId) },
    { key: 'parent', header: d.parent, cell: (u) => unitName(u.parentId) },
  ];
  const teamColumns: Column<OrgSnapshot['teams'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (tm) => tm.name },
    { key: 'unit', header: t.common.orgUnit, cell: (tm) => unitName(tm.orgUnitId) },
  ];
  const positionColumns: Column<OrgSnapshot['positions'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (p) => p.name },
    { key: 'code', header: t.common.code, cell: (p) => <code className="text-xs">{p.code}</code> },
  ];
  const zoneColumns: Column<OrgSnapshot['zones'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (z) => z.name },
    { key: 'code', header: t.common.code, cell: (z) => <code className="text-xs">{z.code}</code> },
    { key: 'type', header: d.type, cell: (z) => d.zoneTypes[z.type] },
    { key: 'unit', header: t.common.orgUnit, cell: (z) => unitName(z.orgUnitId) },
    {
      key: 'shared',
      header: d.shared,
      cell: (z) =>
        z.isShared ? (
          <StatusPill tone="info">{all.ui.common.yes}</StatusPill>
        ) : (
          <Muted>{all.ui.common.no}</Muted>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Feedback error={error} notice={notice} />

      <Section title={d.sites}>
        <DataTable
          columns={siteColumns}
          rows={org.sites}
          rowKey={(s) => s.id}
          empty={t.common.empty}
          pageSize={10}
        />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(ev) =>
            submit(
              ev,
              () => adminOrgApi.createSite(site),
              () => setSite({ ...site, code: '', name: '' }),
            )
          }
        >
          <FormField label={t.common.code} hint={hints.directoriesCode} className="w-40">
            {(id) => (
              <Input
                id={id}
                value={site.code}
                onChange={(ev) => setSite({ ...site, code: ev.target.value })}
                required
                pattern="[a-z0-9-]{2,32}"
              />
            )}
          </FormField>
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input
                id={id}
                value={site.name}
                onChange={(ev) => setSite({ ...site, name: ev.target.value })}
                required
              />
            )}
          </FormField>
          <FormField label={d.timezone} hint={hints.directoriesTimezone} className="w-48">
            {(id) => (
              <Input
                id={id}
                value={site.timezone}
                onChange={(ev) => setSite({ ...site, timezone: ev.target.value })}
                required
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary" disabled={busy}>
            {t.common.add}
          </Button>
        </form>
      </Section>

      <Section title={d.orgUnits}>
        <DataTable
          columns={unitColumns}
          rows={org.orgUnits}
          rowKey={(u) => u.id}
          empty={t.common.empty}
          pageSize={10}
        />
        <form
          className="flex flex-wrap items-end gap-3"
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
          <SelectField
            label={t.common.site}
            value={unit.siteId}
            onChange={(v) => setUnit({ ...unit, siteId: v, parentId: '' })}
            required
            options={org.sites.map((s) => ({ value: s.id, label: s.name }))}
            className="w-56"
          />
          <SelectField
            label={d.parent}
            value={unit.parentId}
            onChange={(v) => setUnit({ ...unit, parentId: v })}
            placeholder={t.common.none}
            options={org.orgUnits
              .filter((u) => u.siteId === unit.siteId)
              .map((u) => ({ value: u.id, label: u.name }))}
            className="w-56"
          />
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input
                id={id}
                value={unit.name}
                onChange={(ev) => setUnit({ ...unit, name: ev.target.value })}
                required
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary" disabled={busy || !unit.siteId}>
            {t.common.add}
          </Button>
        </form>
      </Section>

      <Section title={d.teams}>
        <DataTable
          columns={teamColumns}
          rows={org.teams}
          rowKey={(tm) => tm.id}
          empty={t.common.empty}
          pageSize={10}
        />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(ev) =>
            submit(
              ev,
              () => adminOrgApi.createTeam(team),
              () => setTeam({ ...team, name: '' }),
            )
          }
        >
          <SelectField
            label={t.common.orgUnit}
            value={team.orgUnitId}
            onChange={(v) => setTeam({ ...team, orgUnitId: v })}
            required
            options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
            className="w-56"
          />
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input
                id={id}
                value={team.name}
                onChange={(ev) => setTeam({ ...team, name: ev.target.value })}
                required
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary" disabled={busy || !team.orgUnitId}>
            {t.common.add}
          </Button>
        </form>
      </Section>

      <Section title={d.positions}>
        <DataTable
          columns={positionColumns}
          rows={org.positions}
          rowKey={(p) => p.id}
          empty={t.common.empty}
          pageSize={10}
        />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(ev) =>
            submit(
              ev,
              () => adminOrgApi.createPosition(position),
              () => setPosition({ code: '', name: '' }),
            )
          }
        >
          <FormField label={t.common.code} hint={hints.directoriesCode} className="w-40">
            {(id) => (
              <Input
                id={id}
                value={position.code}
                onChange={(ev) => setPosition({ ...position, code: ev.target.value.toUpperCase() })}
                required
                pattern="[A-Z0-9_]{2,32}"
              />
            )}
          </FormField>
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input
                id={id}
                value={position.name}
                onChange={(ev) => setPosition({ ...position, name: ev.target.value })}
                required
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary" disabled={busy}>
            {t.common.add}
          </Button>
        </form>
      </Section>

      <Section title={d.zones} hint={hints.directoriesZoneType}>
        <DataTable
          columns={zoneColumns}
          rows={org.zones}
          rowKey={(z) => z.id}
          empty={t.common.empty}
          pageSize={10}
          rowClassName={(z) => (z.isActive ? undefined : 'text-muted-foreground')}
        />
        <form
          className="flex flex-wrap items-end gap-3"
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
          <SelectField
            label={t.common.orgUnit}
            value={zone.orgUnitId}
            onChange={(v) => setZone({ ...zone, orgUnitId: v })}
            required
            options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
            className="w-56"
          />
          <FormField label={t.common.code} hint={hints.directoriesCode} className="w-40">
            {(id) => (
              <Input
                id={id}
                value={zone.code}
                onChange={(ev) => setZone({ ...zone, code: ev.target.value.toUpperCase() })}
                required
                pattern="[A-Z0-9_]{2,32}"
              />
            )}
          </FormField>
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input
                id={id}
                value={zone.name}
                onChange={(ev) => setZone({ ...zone, name: ev.target.value })}
                required
              />
            )}
          </FormField>
          <SelectField
            label={d.type}
            value={zone.type}
            onChange={(v) => setZone({ ...zone, type: v as ZoneType })}
            options={ZONE_TYPES.map((zt) => ({ value: zt, label: d.zoneTypes[zt] }))}
            className="w-44"
          />
          <div className="flex h-8 items-center gap-2">
            <Checkbox
              id="zone-shared"
              checked={zone.isShared}
              onCheckedChange={(v) => setZone({ ...zone, isShared: v === true })}
            />
            <Label htmlFor="zone-shared">{d.shared}</Label>
            <InfoTip text={hints.directoriesShared} />
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !zone.orgUnitId}>
            {t.common.add}
          </Button>
        </form>
      </Section>
    </div>
  );
}
