import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isBlank, isUnchanged } from '@/lib/forms';
import type { OrgSnapshot, WebUserView } from '@vakhta/contracts';
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
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { adminOrgApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { notifySuccess } from '@/lib/toast';

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

interface FormProps {
  readonly edit: DirectoryEdit;
  readonly org: OrgSnapshot;
  readonly users: readonly WebUserView[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * One dialog for the five directories: the fields depend on the kind of row being edited. The
 * form is mounted under the row's own key, so opening another row starts a form of its own
 * instead of a stale draft being written over field by field.
 */
export function EditDirectoryDialog({
  edit,
  ...rest
}: {
  readonly edit: DirectoryEdit | null;
  readonly org: OrgSnapshot;
  readonly users: readonly WebUserView[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  return (
    <Dialog open={edit !== null} onOpenChange={(open) => !open && rest.onClose()}>
      <DialogContent className="sm:max-w-lg">
        {edit && <DirectoryForm key={`${edit.kind}:${edit.row.id}`} edit={edit} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function DirectoryForm({ edit, org, users, onClose, onSaved }: FormProps) {
  const [name, setName] = useState(edit.row.name);
  const [timezone, setTimezone] = useState(edit.kind === 'sites' ? edit.row.timezone : '');
  const [parentId, setParentId] = useState(
    edit.kind === 'orgUnits' ? (edit.row.parentId ?? '') : '',
  );
  const [masterUserId, setMasterUserId] = useState(
    edit.kind === 'orgUnits' ? (edit.row.masters[0]?.id ?? '') : '',
  );
  const [orgUnitId, setOrgUnitId] = useState(edit.kind === 'teams' ? edit.row.orgUnitId : '');
  const [type, setType] = useState<(typeof ZONE_TYPES)[number]>(
    edit.kind === 'zones' ? edit.row.type : 'AREA',
  );
  const [isShared, setIsShared] = useState(edit.kind === 'zones' ? edit.row.isShared : false);
  const [isActive, setIsActive] = useState(edit.kind === 'zones' ? edit.row.isActive : true);

  /** The draft equals the record on screen: nothing to save. */
  const unchanged = (() => {
    if (isBlank(name)) return true;
    switch (edit.kind) {
      case 'sites':
        return isUnchanged(
          { name, timezone },
          { name: edit.row.name, timezone: edit.row.timezone },
        );
      case 'orgUnits':
        return isUnchanged(
          { name, parentId: parentId || null, masterUserId: masterUserId || null },
          {
            name: edit.row.name,
            parentId: edit.row.parentId ?? null,
            masterUserId: edit.row.masters[0]?.id ?? null,
          },
        );
      case 'teams':
        return isUnchanged(
          { name, orgUnitId },
          { name: edit.row.name, orgUnitId: edit.row.orgUnitId },
        );
      case 'positions':
        return name === edit.row.name;
      case 'zones':
        return isUnchanged(
          { name, type, isShared, isActive },
          {
            name: edit.row.name,
            type: edit.row.type,
            isShared: edit.row.isShared,
            isActive: edit.row.isActive,
          },
        );
    }
  })();

  const save = useMutation({
    mutationFn: async () => {
      switch (edit.kind) {
        case 'sites':
          return adminOrgApi.updateSite(edit.row.id, { name, timezone });
        case 'orgUnits':
          return adminOrgApi.updateOrgUnit(edit.row.id, {
            name,
            parentId: parentId || null,
            masterUserId: masterUserId || null,
          });
        case 'teams':
          return adminOrgApi.updateTeam(edit.row.id, { name, orgUnitId });
        case 'positions':
          return adminOrgApi.updatePosition(edit.row.id, { name });
        case 'zones':
          return adminOrgApi.updateZone(edit.row.id, { name, type, isShared, isActive });
      }
    },
    onSuccess: () => {
      notifySuccess(d.updated);
      onSaved();
    },
  });
  const busy = save.isPending;
  const error = readError(save.error);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    save.mutate();
  }

  const title = {
    sites: d.sites,
    orgUnits: d.orgUnits,
    teams: d.teams,
    positions: d.positions,
    zones: d.zones,
  }[edit.kind];

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {d.edit}: {title} · {edit.row.name}
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
        {edit.kind === 'sites' && (
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
        {edit.kind === 'orgUnits' && (
          <>
            <SelectField
              label={d.parent}
              value={parentId}
              onChange={setParentId}
              placeholder={t.common.none}
              options={org.orgUnits
                .filter((u) => u.siteId === edit.row.siteId && u.id !== edit.row.id)
                .map((u) => ({ value: u.id, label: u.name }))}
            />
            <SelectField
              label={d.unitMaster}
              hint={d.noMasterNotice}
              value={masterUserId}
              onChange={setMasterUserId}
              placeholder={t.common.none}
              options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
            />
          </>
        )}
        {edit.kind === 'teams' && (
          <SelectField
            label={t.common.orgUnit}
            value={orgUnitId}
            onChange={setOrgUnitId}
            required
            options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
          />
        )}
        {edit.kind === 'zones' && (
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
          <Button type="submit" disabled={busy || unchanged}>
            {all.ui.common.save}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
