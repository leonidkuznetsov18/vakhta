import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrgSnapshot } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill } from '@/components/app/page';
import { adminOrgApi, usersApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { usePersistentState } from '@/lib/ui-store';
import { isBlank } from '@/lib/forms';
import { AddDialog } from '@/components/app/add-dialog';
import { DialogFooter } from '@/components/ui/dialog';
import { useConfirm } from '@/components/app/confirm-dialog';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { EditDirectoryDialog, type DirectoryEdit } from './EditDirectoryDialog.tsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '../api.ts';

const all = messages(currentLocale());
const t = all.admin.administration;
const d = t.directories;
const hints = all.ui.hints;
const KIND_PATH = {
  sites: 'sites',
  orgUnits: 'units',
  teams: 'teams',
  positions: 'positions',
  zones: 'zones',
} as const;
const ZONE_TYPES = ['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER'] as const;
type ZoneType = (typeof ZONE_TYPES)[number];

interface Props {
  readonly org: OrgSnapshot;
}

/** Enterprise directories: sites, units, teams, positions, zones (spec 9.1). */
export function DirectoriesTab({ org }: Props) {
  const [dlg, setDlg] = useState<'sites' | 'orgUnits' | 'teams' | 'positions' | 'zones' | null>(
    null,
  );
  const [editing, setEditing] = useState<DirectoryEdit | null>(null);
  const users = useQuery({ queryKey: keys.users, queryFn: () => usersApi.list() }).data ?? [];
  const { confirm, dialog } = useConfirm();
  const client = useQueryClient();
  /** Every directory on this page lives in one snapshot, so every change re-reads that one thing. */
  const reload = () => client.invalidateQueries({ queryKey: keys.org });

  const drop = useMutation({
    mutationFn: async (v: { kind: DirectoryEdit['kind']; id: string; reason: string }) => {
      try {
        await adminOrgApi.deleteDirectoryRow(KIND_PATH[v.kind], v.id, v.reason);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'DIRECTORY_ROW_IN_USE') throw new Error(d.inUse);
        throw e;
      }
    },
    onSuccess: async () => {
      notifySuccess(d.deleted);
      await reload();
    },
  });

  /**
   * `what` names the thing that was created — "Запис додано" over a list that looks unchanged says
   * nothing about which of the six directories on this page just gained a row.
   */
  const add = useMutation({
    mutationFn: (v: { action: () => Promise<unknown>; reset: () => void; what: string }) =>
      v.action(),
    onSuccess: async (_result, v) => {
      notifySuccess(format(t.common.addedNamed, { what: v.what }));
      v.reset();
      setDlg(null);
      await reload();
    },
  });

  const busy = drop.isPending || add.isPending;
  const error = readError(drop.error ?? add.error);

  async function remove(kind: DirectoryEdit['kind'], id: string, name: string) {
    const reason = await confirm({
      title: format(d.deleteConfirm, { name }),
      description: hints.directoriesDelete,
      confirmLabel: d.delete,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (!reason) return;
    drop.mutate({ kind, id, reason });
  }

  const rowMenu = (
    kind: DirectoryEdit['kind'],
    row: { id: string; name: string },
    edit: DirectoryEdit,
  ) => [
    {
      key: 'edit',
      label: d.edit,
      icon: PencilIcon,
      disabled: busy,
      onSelect: () => setEditing(edit),
    },
    {
      key: 'delete',
      label: d.delete,
      icon: Trash2Icon,
      disabled: busy,
      destructive: true,
      separator: true,
      onSelect: () => void remove(kind, row.id, row.name),
    },
  ];
  const [site, setSite] = usePersistentState('directories.site', {
    code: '',
    name: '',
    timezone: 'Europe/Kyiv',
  });
  const [unit, setUnit] = usePersistentState('directories.unit', {
    siteId: org.sites[0]?.id ?? '',
    parentId: '',
    name: '',
    masterUserId: '',
  });
  const [team, setTeam] = usePersistentState('directories.team', {
    orgUnitId: org.orgUnits[0]?.id ?? '',
    name: '',
  });
  const [position, setPosition] = usePersistentState('directories.position', {
    code: '',
    name: '',
  });
  const [zone, setZone] = usePersistentState('directories.zone', {
    orgUnitId: org.orgUnits[0]?.id ?? '',
    code: '',
    name: '',
    type: 'AREA' as ZoneType,
    isShared: false,
  });

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;
  const unitName = (id: string | null) =>
    id ? (org.orgUnits.find((u) => u.id === id)?.name ?? id) : '—';

  function submit(ev: FormEvent, action: () => Promise<unknown>, reset: () => void, what: string) {
    ev.preventDefault();
    add.mutate({ action, reset, what });
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
    {
      key: 'master',
      header: d.unitMaster,
      cell: (u) =>
        u.masters.length > 0 ? (
          <span>{u.masters.map((m) => m.name).join(', ')}</span>
        ) : (
          <StatusPill tone="danger">{d.noMaster}</StatusPill>
        ),
    },
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
      key: 'active',
      header: d.active,
      cell: (z) =>
        z.isActive ? (
          <StatusPill tone="success">{all.ui.common.yes}</StatusPill>
        ) : (
          <Muted>{all.ui.common.no}</Muted>
        ),
    },
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
      <Feedback error={error} />

      <Section
        title={d.sites}
        actions={
          <AddDialog
            title={d.sites}
            triggerVariant="outline"
            open={dlg === 'sites'}
            onOpenChange={(o) => setDlg(o ? 'sites' : null)}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(ev) =>
                submit(
                  ev,
                  () => adminOrgApi.createSite(site),
                  () => setSite({ ...site, code: '', name: '' }),
                  site.name,
                )
              }
            >
              <FormField label={t.common.code} hint={hints.directoriesCode}>
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
              <FormField label={t.common.name}>
                {(id) => (
                  <Input
                    id={id}
                    value={site.name}
                    onChange={(ev) => setSite({ ...site, name: ev.target.value })}
                    required
                  />
                )}
              </FormField>
              <FormField label={d.timezone} hint={hints.directoriesTimezone}>
                {(id) => (
                  <Input
                    id={id}
                    value={site.timezone}
                    onChange={(ev) => setSite({ ...site, timezone: ev.target.value })}
                    required
                  />
                )}
              </FormField>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDlg(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={busy || isBlank(site.code) || isBlank(site.name)}>
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <DataTable
          columns={siteColumns}
          onRowClick={(s) => setEditing({ kind: 'sites', row: s })}
          rowActions={(s) => rowMenu('sites', s, { kind: 'sites', row: s })}
          searchText={(s) => s.name}
          rows={org.sites}
          rowKey={(s) => s.id}
          empty={t.common.empty}
          pageSize={10}
          storageKey="directories.sites"
          emptyAction={
            <Button type="button" variant="outline" onClick={() => setDlg('sites')}>
              {t.common.add}
            </Button>
          }
        />
      </Section>

      <Section
        title={d.orgUnits}
        actions={
          <AddDialog
            title={d.orgUnits}
            triggerVariant="outline"
            open={dlg === 'orgUnits'}
            onOpenChange={(o) => setDlg(o ? 'orgUnits' : null)}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(ev) =>
                submit(
                  ev,
                  () =>
                    adminOrgApi.createOrgUnit({
                      siteId: unit.siteId,
                      name: unit.name,
                      parentId: unit.parentId || null,
                      masterUserId: unit.masterUserId || null,
                    }),
                  () => setUnit({ ...unit, name: '' }),
                  unit.name,
                )
              }
            >
              <SelectField
                label={t.common.site}
                value={unit.siteId}
                onChange={(v) => setUnit({ ...unit, siteId: v, parentId: '' })}
                required
                options={org.sites.map((s) => ({ value: s.id, label: s.name }))}
              />
              <SelectField
                label={d.parent}
                value={unit.parentId}
                onChange={(v) => setUnit({ ...unit, parentId: v })}
                placeholder={t.common.none}
                options={org.orgUnits
                  .filter((u) => u.siteId === unit.siteId)
                  .map((u) => ({ value: u.id, label: u.name }))}
              />
              <SelectField
                label={d.unitMaster}
                hint={d.noMasterNotice}
                value={unit.masterUserId}
                onChange={(v) => setUnit({ ...unit, masterUserId: v })}
                placeholder={t.common.none}
                options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
              />
              <FormField label={t.common.name}>
                {(id) => (
                  <Input
                    id={id}
                    value={unit.name}
                    onChange={(ev) => setUnit({ ...unit, name: ev.target.value })}
                    required
                  />
                )}
              </FormField>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDlg(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={busy || !unit.siteId || isBlank(unit.name)}>
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        {org.orgUnits.some((u) => u.masters.length === 0) && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>
              {format(d.noMasterNotice, {
                n: org.orgUnits.filter((u) => u.masters.length === 0).length,
              })}
            </AlertDescription>
          </Alert>
        )}
        <DataTable
          columns={unitColumns}
          onRowClick={(u) => setEditing({ kind: 'orgUnits', row: u })}
          rowActions={(u) => rowMenu('orgUnits', u, { kind: 'orgUnits', row: u })}
          searchText={(u) => u.name}
          rows={org.orgUnits}
          rowKey={(u) => u.id}
          empty={t.common.empty}
          pageSize={10}
          storageKey="directories.orgUnits"
          emptyAction={
            <Button type="button" variant="outline" onClick={() => setDlg('orgUnits')}>
              {t.common.add}
            </Button>
          }
        />
      </Section>

      <Section
        title={d.teams}
        actions={
          <AddDialog
            title={d.teams}
            triggerVariant="outline"
            open={dlg === 'teams'}
            onOpenChange={(o) => setDlg(o ? 'teams' : null)}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(ev) =>
                submit(
                  ev,
                  () => adminOrgApi.createTeam(team),
                  () => setTeam({ ...team, name: '' }),
                  team.name,
                )
              }
            >
              <SelectField
                label={t.common.orgUnit}
                value={team.orgUnitId}
                onChange={(v) => setTeam({ ...team, orgUnitId: v })}
                required
                options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
              />
              <FormField label={t.common.name}>
                {(id) => (
                  <Input
                    id={id}
                    value={team.name}
                    onChange={(ev) => setTeam({ ...team, name: ev.target.value })}
                    required
                  />
                )}
              </FormField>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDlg(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={busy || !team.orgUnitId || isBlank(team.name)}>
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <DataTable
          columns={teamColumns}
          onRowClick={(tm) => setEditing({ kind: 'teams', row: tm })}
          rowActions={(tm) => rowMenu('teams', tm, { kind: 'teams', row: tm })}
          searchText={(tm) => tm.name}
          rows={org.teams}
          rowKey={(tm) => tm.id}
          empty={t.common.empty}
          pageSize={10}
          storageKey="directories.teams"
          emptyAction={
            <Button type="button" variant="outline" onClick={() => setDlg('teams')}>
              {t.common.add}
            </Button>
          }
        />
      </Section>

      <Section
        title={d.positions}
        actions={
          <AddDialog
            title={d.positions}
            triggerVariant="outline"
            open={dlg === 'positions'}
            onOpenChange={(o) => setDlg(o ? 'positions' : null)}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(ev) =>
                submit(
                  ev,
                  () => adminOrgApi.createPosition(position),
                  () => setPosition({ code: '', name: '' }),
                  position.name,
                )
              }
            >
              <FormField label={t.common.code} hint={hints.directoriesCode}>
                {(id) => (
                  <Input
                    id={id}
                    value={position.code}
                    onChange={(ev) =>
                      setPosition({ ...position, code: ev.target.value.toUpperCase() })
                    }
                    required
                    pattern="[A-Z0-9_]{2,32}"
                  />
                )}
              </FormField>
              <FormField label={t.common.name}>
                {(id) => (
                  <Input
                    id={id}
                    value={position.name}
                    onChange={(ev) => setPosition({ ...position, name: ev.target.value })}
                    required
                  />
                )}
              </FormField>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDlg(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={busy || isBlank(position.code) || isBlank(position.name)}
                >
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <DataTable
          columns={positionColumns}
          onRowClick={(p) => setEditing({ kind: 'positions', row: p })}
          rowActions={(p) => rowMenu('positions', p, { kind: 'positions', row: p })}
          searchText={(p) => p.name}
          rows={org.positions}
          rowKey={(p) => p.id}
          empty={t.common.empty}
          pageSize={10}
          storageKey="directories.positions"
          emptyAction={
            <Button type="button" variant="outline" onClick={() => setDlg('positions')}>
              {t.common.add}
            </Button>
          }
        />
      </Section>

      <Section
        title={d.zones}
        hint={hints.directoriesZoneType}
        actions={
          <AddDialog
            title={d.zones}
            triggerVariant="outline"
            open={dlg === 'zones'}
            onOpenChange={(o) => setDlg(o ? 'zones' : null)}
          >
            <form
              className="flex flex-col gap-4"
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
                  zone.name,
                );
              }}
            >
              <SelectField
                label={t.common.orgUnit}
                value={zone.orgUnitId}
                onChange={(v) => setZone({ ...zone, orgUnitId: v })}
                required
                options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
              />
              <FormField label={t.common.code} hint={hints.directoriesCode}>
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
              <FormField label={t.common.name}>
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
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDlg(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !zone.orgUnitId || isBlank(zone.code) || isBlank(zone.name)}
                >
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <DataTable
          columns={zoneColumns}
          onRowClick={(z) => setEditing({ kind: 'zones', row: z })}
          rowActions={(z) => rowMenu('zones', z, { kind: 'zones', row: z })}
          searchText={(z) => z.name}
          rows={org.zones}
          rowKey={(z) => z.id}
          empty={t.common.empty}
          pageSize={10}
          storageKey="directories.zones"
          emptyAction={
            <Button type="button" variant="outline" onClick={() => setDlg('zones')}>
              {t.common.add}
            </Button>
          }
          rowClassName={(z) => (z.isActive ? undefined : 'text-muted-foreground')}
        />
      </Section>
      <EditDirectoryDialog
        edit={editing}
        org={org}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
      {dialog}
    </div>
  );
}
