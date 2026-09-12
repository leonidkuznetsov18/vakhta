import { z } from 'zod';
import { apiFetch } from '@/api';
import {
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
    return z.array(ScheduleVersionView).parse(await apiFetch(`${root}?${query}`, { signal }));
  },
  async detail(id: string, signal: AbortSignal) {
    return ScheduleVersionDetail.parse(await apiFetch(`${root}/${id}`, { signal }));
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
    return ScheduleVersionView.parse(await post(root, CreateScheduleVersionCommand.parse(input)));
  },
  async save(id: string, input: PutAssignmentsCommand) {
    return ScheduleVersionDetail.parse(
      await apiFetch(`${root}/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify(PutAssignmentsCommand.parse(input)),
      }),
    );
  },
  async submit(id: string) {
    return ScheduleVersionView.parse(await post(`${root}/${id}/submit`, {}));
  },
  async publish(id: string, input: PublishScheduleCommand) {
    return ScheduleVersionView.parse(
      await post(`${root}/${id}/publish`, PublishScheduleCommand.parse(input)),
    );
  },
  async revise(id: string, input: ReviseScheduleCommand) {
    return ScheduleVersionView.parse(
      await post(`${root}/${id}/revise`, ReviseScheduleCommand.parse(input)),
    );
  },
  async returnDraft(id: string, input: ReturnToDraftCommand) {
    return ScheduleVersionView.parse(
      await post(`${root}/${id}/return`, ReturnToDraftCommand.parse(input)),
    );
  },
  async remove(id: string) {
    await apiFetch(`${root}/${id}`, { method: 'DELETE' });
  },
};
