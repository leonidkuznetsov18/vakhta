import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOpenSlotCommand,
  OfferSlotCommand,
  OpenSlotView,
  SelectSlotCommand,
} from '@vakhta/contracts';
import { openSlotsApi } from '../api/open-slots-api';
import { scheduleKeys } from './ownership';

export const openSlotsKey = (access: string, siteId: string, orgUnitId: string, month: string) =>
  [...scheduleKeys.all(access), 'open-slots', siteId, orgUnitId, month] as const;

/** Open slots of the unit month; a selection also refreshes the plan it wrote into. */
export function useOpenSlots(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly month: string;
  readonly enabled: boolean;
}) {
  const client = useQueryClient();
  const key = openSlotsKey(input.accessKey, input.siteId, input.orgUnitId, input.month);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      openSlotsApi.list(
        { siteId: input.siteId, orgUnitId: input.orgUnitId, periodMonth: input.month },
        signal,
      ),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const options = { retry: false, networkMode: 'always' as const };
  const create = useMutation({
    ...options,
    mutationFn: (command: CreateOpenSlotCommand) => openSlotsApi.create(command),
    onSuccess: refresh,
  });
  const offer = useMutation({
    ...options,
    mutationFn: (variables: { id: string; command: OfferSlotCommand }) =>
      openSlotsApi.offer(variables.id, variables.command),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    ...options,
    mutationFn: (id: string) => openSlotsApi.withdraw(id),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    ...options,
    mutationFn: (id: string) => openSlotsApi.cancel(id),
    onSuccess: refresh,
  });
  const select = useMutation({
    ...options,
    mutationFn: (variables: { id: string; command: SelectSlotCommand }) =>
      openSlotsApi.select(variables.id, variables.command),
    onSuccess: () => client.invalidateQueries({ queryKey: scheduleKeys.all(input.accessKey) }),
    onError: refresh,
  });
  const slots: readonly OpenSlotView[] = query.data ?? [];
  return {
    query,
    slots,
    open: slots.filter((slot) => slot.status === 'OPEN' || slot.status === 'OFFERED'),
    create,
    offer,
    withdraw,
    cancel,
    select,
    busy:
      create.isPending ||
      offer.isPending ||
      withdraw.isPending ||
      cancel.isPending ||
      select.isPending,
  };
}
export type OpenSlots = ReturnType<typeof useOpenSlots>;
