import { UpdateEmployeeProfileCommand, type EmployeeProfileView } from '@vakhta/contracts';
import { ApiError } from '@/api';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
export type ProfileSection = 'identity' | 'contacts' | 'personal' | 'all';
export type ProfileDraft = Record<
  | 'personnelNumber'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'telegramUsername'
  | 'birthDate'
  | 'maritalStatus',
  string
>;
export const sectionFields = {
  all: [
    'personnelNumber',
    'fullName',
    'phone',
    'email',
    'telegramUsername',
    'birthDate',
    'maritalStatus',
  ],
  identity: ['personnelNumber', 'fullName'],
  contacts: ['phone', 'email', 'telegramUsername'],
  personal: ['birthDate', 'maritalStatus'],
} as const;
export function profileDraft(profile: EmployeeProfileView): ProfileDraft {
  return {
    personnelNumber: profile.employee.personnelNumber,
    fullName: profile.employee.fullName,
    email: profile.employee.email ?? '',
    phone: profile.employee.phone ?? '',
    telegramUsername: profile.employee.telegramUsername ?? '',
    birthDate: typeof profile.birthDate === 'string' ? profile.birthDate : '',
    maritalStatus: profile.maritalStatus ?? '',
  };
}
export function sectionCommand(section: ProfileSection, draft: ProfileDraft, version: string) {
  const fields = Object.fromEntries(
    sectionFields[section].map((field) => [
      field,
      draft[field].trim() || (field === 'fullName' || field === 'personnelNumber' ? '' : null),
    ]),
  );
  return UpdateEmployeeProfileCommand.safeParse({ ...fields, expectedVersion: version });
}
export function sectionChanged(
  section: ProfileSection,
  draft: ProfileDraft,
  baseline: ProfileDraft,
  version: string,
) {
  const command = sectionCommand(section, draft, version);
  const saved = sectionCommand(section, baseline, version);
  return command.success && saved.success
    ? JSON.stringify(command.data) !== JSON.stringify(saved.data)
    : sectionFields[section].some((field) => draft[field] !== baseline[field]);
}
export function profileError(error: unknown) {
  const t = messages(currentLocale()).employeeProfile;
  if (error instanceof ApiError) {
    if (
      error.code === 'EMPLOYEE_VERSION_CONFLICT' ||
      error.code === 'COMPENSATION_VERSION_CONFLICT'
    )
      return t.conflict;
    if (error.code === 'AVATAR_INVALID') return t.avatarInvalid;
    if (error.code === 'AVATAR_TOO_LARGE') return t.avatarLarge;
  }
  return t.failed;
}
