import { z } from 'zod';
import { apiFetch } from '@/api';
import {
  CreateOpenSlotCommand,
  OfferSlotCommand,
  OpenSlotView,
  OpenSlotsQuery,
  ScheduleVersionDetail,
  SelectSlotCommand,
} from '@vakhta/contracts';

const root = '/admin/schedules/open-slots';
const post = (path: string, body?: unknown) =>
  apiFetch(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Open slots, offers, responses and selection (SC-15, SC-16). */
export const openSlotsApi = {
  async list(query: OpenSlotsQuery, signal: AbortSignal) {
    const params = new URLSearchParams(OpenSlotsQuery.parse(query));
    return z.array(OpenSlotView).parse(await apiFetch(`${root}?${params}`, { signal }));
  },
  async create(input: CreateOpenSlotCommand) {
    return OpenSlotView.parse(await post(root, CreateOpenSlotCommand.parse(input)));
  },
  async offer(id: string, input: OfferSlotCommand) {
    return OpenSlotView.parse(
      await post(`${root}/${encodeURIComponent(id)}/offer`, OfferSlotCommand.parse(input)),
    );
  },
  async withdraw(id: string) {
    return OpenSlotView.parse(await post(`${root}/${encodeURIComponent(id)}/withdraw`, {}));
  },
  async cancel(id: string) {
    return OpenSlotView.parse(await post(`${root}/${encodeURIComponent(id)}/cancel`, {}));
  },
  async select(id: string, input: SelectSlotCommand) {
    return z
      .object({ slot: OpenSlotView, detail: ScheduleVersionDetail })
      .parse(
        await post(`${root}/${encodeURIComponent(id)}/select`, SelectSlotCommand.parse(input)),
      );
  },
};
