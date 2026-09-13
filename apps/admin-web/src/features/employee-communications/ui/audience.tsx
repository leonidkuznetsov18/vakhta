import { useState } from 'react';
import { useStore } from 'zustand';
import { useQuery, useMutation } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { useOrg } from '@/lib/org';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { TableCount } from '@/components/app/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/app/fields';
import { communicationApi, communicationKey } from '../api/communications';
import { useCommunicationDraft } from '../model/context';
import { communicationError } from '../model/feedback';
export function Audience() {
  const t = messages(currentLocale()).communications;
  const common = messages(currentLocale()).admin;
  const draft = useCommunicationDraft();
  const recipients = useStore(draft.store, (state) => state.recipients);
  const { actorId } = useNavigation();
  const [audienceOpen, setAudienceOpen] = useState(recipients.length === 0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [siteId, setSite] = useState('');
  const [orgUnitId, setUnit] = useState('');
  const [teamId, setTeam] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const { orgOrEmpty: org } = useOrg();
  const filters = {
    search,
    page,
    ...(siteId ? { siteId } : {}),
    ...(orgUnitId ? { orgUnitId } : {}),
    ...(teamId ? { teamId } : {}),
  };
  const query = useQuery({
    queryKey: [...communicationKey(actorId ?? ''), 'audience', filters],
    queryFn: ({ signal }) => communicationApi.audience(filters, signal),
    enabled: !selectedOnly,
  });
  const selectAll = useMutation({
    mutationFn: (input: { requestId: string; filters: typeof filters }) =>
      communicationApi.all(input.filters),
    onSuccess: (result, input) => {
      if (
        draft.store.getState().requestId !== input.requestId ||
        JSON.stringify(input.filters) !== JSON.stringify(filters)
      )
        return;
      const selected = new Map(
        draft.store.getState().recipients.map((person) => [person.id, person]),
      );
      for (const person of result.items) selected.set(person.id, person);
      if (selected.size <= 500) draft.change({ recipients: [...selected.values()] });
      else draft.update({ error: new Error(t.errors.COMMUNICATION_AUDIENCE_LIMIT) });
    },
  });
  const selectedRows = recipients.filter((person) =>
    `${person.fullName} ${person.personnelNumber}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const items = selectedOnly
    ? selectedRows
        .slice((page - 1) * 30, page * 30)
        .map((person) => ({ ...person, eligible: true, reason: null, unitName: null }))
    : (query.data?.items ?? []);
  const total = selectedOnly ? selectedRows.length : query.data?.total;
  return (
    <details
      className="group rounded-xl border bg-background"
      open={audienceOpen}
      onToggle={(event) => setAudienceOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        {t.recipients}{' '}
        <span className="float-right text-sm tabular-nums text-muted-foreground">
          {recipients.length || '+'}
        </span>
        {recipients.length > 0 && (
          <span className="mt-1 block truncate text-sm font-normal text-muted-foreground">
            {recipients
              .slice(0, 3)
              .map((person) => person.fullName)
              .join(', ')}
            {recipients.length > 3 ? '…' : ''}
          </span>
        )}
      </summary>
      <div className="space-y-3 border-t p-3">
        <Input
          aria-label={t.search}
          placeholder={t.search}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {!selectedOnly && (
          <details>
            <summary className="cursor-pointer py-2 text-sm font-medium">
              {t.audienceFilters}
            </summary>
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectField
                label={common.operations.site}
                value={siteId}
                onChange={(value) => {
                  setSite(value);
                  setUnit('');
                  setTeam('');
                  setPage(1);
                }}
                options={org.sites.map((row) => ({ value: row.id, label: row.name }))}
                placeholder={t.all}
              />
              <SelectField
                label={common.operations.orgUnit}
                value={orgUnitId}
                onChange={(value) => {
                  setUnit(value);
                  setTeam('');
                  setPage(1);
                }}
                options={org.orgUnits
                  .filter((row) => !siteId || row.siteId === siteId)
                  .map((row) => ({ value: row.id, label: row.name }))}
                placeholder={t.all}
              />
              <SelectField
                label={messages(currentLocale()).employeeProfile.team}
                value={teamId}
                onChange={(value) => {
                  setTeam(value);
                  setPage(1);
                }}
                options={org.teams
                  .filter((row) => !orgUnitId || row.orgUnitId === orgUnitId)
                  .map((row) => ({ value: row.id, label: row.name }))}
                placeholder={t.all}
              />
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selectedOnly ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectedOnly(!selectedOnly);
              setPage(1);
            }}
          >
            {t.selectedOnly}
          </Button>
          {!selectedOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                selectAll.isPending ||
                !query.data?.total ||
                (JSON.stringify(selectAll.variables?.filters) === JSON.stringify(filters) &&
                  !!selectAll.data &&
                  selectAll.data.items.every((person) =>
                    recipients.some((selected) => selected.id === person.id),
                  ))
              }
              onClick={() =>
                selectAll.mutate({ requestId: draft.store.getState().requestId, filters })
              }
            >
              {t.selectAll}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!recipients.length}
            onClick={() => draft.change({ recipients: [] })}
          >
            {t.clear}
          </Button>
        </div>
        {!selectedOnly && (
          <QueryFeedback
            query={query}
            errorMessage={communicationError(query.error) ?? undefined}
          />
        )}
        <Feedback error={communicationError(selectAll.error)} />
        <ul className="max-h-64 overflow-y-auto divide-y rounded-lg border">
          {items.map((person) => (
            <li key={person.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={recipients.some((selected) => selected.id === person.id)}
                  disabled={
                    !person.eligible ||
                    (recipients.length >= 500 &&
                      !recipients.some((selected) => selected.id === person.id))
                  }
                  onChange={() => draft.toggle(person)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{person.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {person.personnelNumber}
                    {person.unitName ? ` · ${person.unitName}` : ''}
                  </span>
                  {person.reason && (
                    <span className="block text-xs text-muted-foreground">
                      {person.reason === 'INACTIVE' ? t.inactive : t.unlinked}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {total === 0 && <p className="text-sm text-muted-foreground">{t.emptyAudience}</p>}
        {total !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <TableCount
              total={total}
              from={total ? (page - 1) * 30 + 1 : 0}
              to={Math.min(total, page * 30)}
            />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t.back}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={page * 30 >= total}
                onClick={() => setPage(page + 1)}
              >
                {t.next}
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
