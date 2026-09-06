import { useEffect, useState, type FormEvent } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { adminOrgApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const d = t.directories;
const ZONE_TYPES = ['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER'] as const;

export type DirectoryEdit =
  | { kind: 'sites'; row: OrgSnapshot['sites'][number] }
  | { kind: 'orgUnits'; row: OrgSnapshot['orgUnits'][number] }
  | { kind: 'teams'; row: OrgSnapshot['teams'][number] }
  | { kind: 'positions'; row: OrgSnapshot['positions'][number] }
  | { kind: 'zones'; row: OrgSnapshot['zones'][number] };

/** One dialog for the five directories: the fields depend on the kind of row being edited. */
export function EditDirectoryDialog({
  edit,
  org,
  onClose,
  onSaved,
}: {
  readonly edit: DirectoryEdit | null;
  readonly org: OrgSnapshot;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [parentId, setParentId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [type, setType] = useState<(typeof ZONE_TYPES)[number]>('AREA');
  const [isShared, setIsShared] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!edit) return;
    setName(edit.row.name);
    if (edit.kind === 'sites') setTimezone(edit.row.timezone);
    if (edit.kind === 'orgUnits') setParentId(edit.row.parentId ?? '');
    if (edit.kind === 'teams') setOrgUnitId(edit.row.orgUnitId);
    if (edit.kind === 'zones') {
      setType(edit.row.type);
      setIsShared(edit.row.isShared);
      setIsActive(edit.row.isActive);
    }
  }, [edit]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!edit) return;
    void run(async () => {
      switch (edit.kind) {
        case 'sites':
          await adminOrgApi.updateSite(edit.row.id, { name, timezone });
          break;
        case 'orgUnits':
          await adminOrgApi.updateOrgUnit(edit.row.id, { name, parentId: parentId || null });
          break;
        case 'teams':
          await adminOrgApi.updateTeam(edit.row.id, { name, orgUnitId });
          break;
        case 'positions':
          await adminOrgApi.updatePosition(edit.row.id, { name });
          break;
        case 'zones':
          await adminOrgApi.updateZone(edit.row.id, { name, type, isShared, isActive });
          break;
      }
      await onSaved();
    }, d.updated);
  }

  const title = edit
    ? {
        sites: d.sites,
        orgUnits: d.orgUnits,
        teams: d.teams,
        positions: d.positions,
        zones: d.zones,
      }[edit.kind]
    : '';

  return (
    <Dialog open={edit !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {d.edit}: {title} · {edit?.row.name}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FormField label={t.common.name}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                required
                maxLength={200}
              />
            )}
          </FormField>
          {edit?.kind === 'sites' && (
            <FormField label={d.timezone} hint={all.ui.hints.directoriesTimezone}>
              {(id) => (
                <Input
                  id={id}
                  value={timezone}
                  onChange={(ev) => setTimezone(ev.target.value)}
                  required
                />
              )}
            </FormField>
          )}
          {edit?.kind === 'orgUnits' && (
            <SelectField
              label={d.parent}
              value={parentId}
              onChange={setParentId}
              placeholder={t.common.none}
              options={org.orgUnits
                .filter((u) => u.siteId === edit.row.siteId && u.id !== edit.row.id)
                .map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
          {edit?.kind === 'teams' && (
            <SelectField
              label={t.common.orgUnit}
              value={orgUnitId}
              onChange={setOrgUnitId}
              required
              options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
          {edit?.kind === 'zones' && (
            <>
              <SelectField
                label={d.type}
                value={type}
                onChange={(v) => setType(v as (typeof ZONE_TYPES)[number])}
                options={ZONE_TYPES.map((zt) => ({ value: zt, label: d.zoneTypes[zt] }))}
                hint={all.ui.hints.directoriesZoneType}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-zone-shared"
                  checked={isShared}
                  onCheckedChange={(v) => setIsShared(v === true)}
                />
                <Label htmlFor="edit-zone-shared">{d.shared}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-zone-active"
                  checked={isActive}
                  onCheckedChange={(v) => setIsActive(v === true)}
                />
                <Label htmlFor="edit-zone-active">{d.active}</Label>
              </div>
            </>
          )}
          <Feedback error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {all.ui.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
