import { z } from 'zod';
import { apiFetch } from '@/api';
import {
  ScheduleWebCommand,
  ScheduleCommandResult,
  ScheduleVersionView,
  ScheduleVersionDetail,
  ShiftTemplateView,
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
const COMMAND_TIMEOUT_MS = 30_000;
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
  async execute(input: ScheduleWebCommand) {
    const command = ScheduleWebCommand.parse(input);
    const result = ScheduleCommandResult.parse(
      await apiFetch(`${root}/commands`, {
        method: 'POST',
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
      }),
    );
    const expectedKind =
      command.action === 'SAVE' ? 'DETAIL' : command.action === 'DELETE' ? 'DELETED' : 'VERSION';
    if (result.commandId !== command.commandId || result.kind !== expectedKind)
      throw new Error('Schedule command response does not match its request');
    if (
      command.action === 'SAVE' &&
      result.kind === 'DETAIL' &&
      result.detail.version.id !== command.versionId
    )
      throw new Error('Schedule save response belongs to another version');
    if (
      command.action === 'DELETE' &&
      result.kind === 'DELETED' &&
      result.versionId !== command.versionId
    )
      throw new Error('Schedule delete response belongs to another version');
    if (
      result.kind === 'VERSION' &&
      command.action !== 'CREATE' &&
      command.action !== 'REVISE' &&
      result.version.id !== command.versionId
    )
      throw new Error('Schedule transition response belongs to another version');
    return result;
  },
};
