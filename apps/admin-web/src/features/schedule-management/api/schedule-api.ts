import { z } from 'zod';
import { apiFetch } from '@/api';
import {
  ScheduleRevisionPrecondition,
  ScheduleVersionView,
  ScheduleVersionDetail,
  ShiftTemplateView,
  CreateScheduleVersionCommand,
  PutAssignmentsCommand,
  ReviseScheduleCommand,
  PublishScheduleCommand,
  ReturnToDraftCommand,
  EmployeeView,
  EmployeesPage,
  type ListScheduleVersionsQuery,
} from '@vakhta/contracts';

const root = '/admin/schedules';
// During a rolling deployment old API reads remain visible, but revision 0 cannot authorize writes.
const readVersion = ScheduleVersionView.extend({
  revision: z.number().int().nonnegative().default(0),
});
const readDetail = ScheduleVersionDetail.extend({ version: readVersion });
async function post(path: string, body: unknown) {
  return apiFetch<unknown>(path, { method: 'POST', body: JSON.stringify(body) });
}
export const scheduleApi = {
  async list(input: ListScheduleVersionsQuery, signal: AbortSignal) {
    const query = new URLSearchParams(
      Object.entries(input).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return z.array(readVersion).parse(await apiFetch(`${root}?${query}`, { signal }));
  },
  async detail(id: string, signal: AbortSignal) {
    return readDetail.parse(await apiFetch(`${root}/${id}`, { signal }));
  },
  async templates(siteId: string, signal: AbortSignal) {
    return z
      .array(ShiftTemplateView)
      .parse(await apiFetch(`${root}/templates?siteId=${encodeURIComponent(siteId)}`, { signal }));
  },
  async employeesPage(after: string | undefined, signal: AbortSignal) {
    const query = new URLSearchParams({ limit: '200', ...(after ? { after } : {}) });
    return EmployeesPage.parse(await apiFetch(`/admin/employees/page?${query}`, { signal }));
  },
  async employee(id: string, signal: AbortSignal) {
    return EmployeeView.parse(await apiFetch(`/admin/employees/${id}`, { signal }));
  },
  async create(input: CreateScheduleVersionCommand) {
    return readVersion.parse(await post(root, CreateScheduleVersionCommand.parse(input)));
  },
  async save(id: string, input: PutAssignmentsCommand & ScheduleRevisionPrecondition) {
    return ScheduleVersionDetail.parse(
      await apiFetch(`${root}/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify(
          PutAssignmentsCommand.extend(ScheduleRevisionPrecondition.shape).parse(input),
        ),
      }),
    );
  },
  async submit(id: string, input: ScheduleRevisionPrecondition) {
    return ScheduleVersionView.parse(
      await post(`${root}/${id}/submit`, ScheduleRevisionPrecondition.parse(input)),
    );
  },
  async publish(id: string, input: PublishScheduleCommand & ScheduleRevisionPrecondition) {
    return ScheduleVersionView.parse(
      await post(
        `${root}/${id}/publish`,
        PublishScheduleCommand.extend(ScheduleRevisionPrecondition.shape).parse(input),
      ),
    );
  },
  async revise(id: string, input: ReviseScheduleCommand & ScheduleRevisionPrecondition) {
    return ScheduleVersionView.parse(
      await post(
        `${root}/${id}/revise`,
        ReviseScheduleCommand.extend(ScheduleRevisionPrecondition.shape).parse(input),
      ),
    );
  },
  async returnDraft(id: string, input: ReturnToDraftCommand & ScheduleRevisionPrecondition) {
    return ScheduleVersionView.parse(
      await post(
        `${root}/${id}/return`,
        ReturnToDraftCommand.extend(ScheduleRevisionPrecondition.shape).parse(input),
      ),
    );
  },
  async remove(id: string, input: ScheduleRevisionPrecondition) {
    await apiFetch(`${root}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(ScheduleRevisionPrecondition.parse(input)),
    });
  },
};
