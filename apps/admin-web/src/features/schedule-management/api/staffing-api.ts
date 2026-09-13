import { apiFetch } from '@/api';
import {
  CreateQualificationCommand,
  EmployeeQualificationView,
  QualificationView,
  RecordEmployeeQualificationCommand,
  SetStaffingRequirementCommand,
  StaffingRequirementView,
  StaffingView,
} from '@vakhta/contracts';

const root = '/admin/schedules/staffing';

/** Staffing demand, qualification catalog and holdings of one unit (SC-01, SC-04). */
export const staffingApi = {
  async view(siteId: string, orgUnitId: string, signal: AbortSignal) {
    const query = new URLSearchParams({ siteId, orgUnitId });
    return StaffingView.parse(await apiFetch(`${root}?${query}`, { signal }));
  },
  async setRequirement(input: SetStaffingRequirementCommand) {
    return StaffingRequirementView.parse(
      await apiFetch(`${root}/requirements`, {
        method: 'PUT',
        body: JSON.stringify(SetStaffingRequirementCommand.parse(input)),
      }),
    );
  },
  async removeRequirement(id: string) {
    await apiFetch(`${root}/requirements/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async createQualification(input: CreateQualificationCommand) {
    return QualificationView.parse(
      await apiFetch(`${root}/qualifications`, {
        method: 'POST',
        body: JSON.stringify(CreateQualificationCommand.parse(input)),
      }),
    );
  },
  async recordHolding(input: RecordEmployeeQualificationCommand) {
    return EmployeeQualificationView.parse(
      await apiFetch(`${root}/holdings`, {
        method: 'POST',
        body: JSON.stringify(RecordEmployeeQualificationCommand.parse(input)),
      }),
    );
  },
  async removeHolding(id: string) {
    await apiFetch(`${root}/holdings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
