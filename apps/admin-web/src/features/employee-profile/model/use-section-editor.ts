import { useState } from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmployeeProfileView, UpdateEmployeeProfileCommand } from '@vakhta/contracts';
import { ApiError } from '@/shared/api';
import { profileApi, profileKey, refreshProfiles } from './api';
import {
  profileDraft,
  profileFormSchema,
  sectionChanged,
  sectionCommand,
  type ProfileSection,
} from './editor';

export function useSectionEditor(
  profile: EmployeeProfileView,
  section: ProfileSection,
  onClose: () => void,
) {
  const [saved, setSaved] = useState(() => ({
    draft: profileDraft(profile),
    version: profile.version,
  }));
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (command: UpdateEmployeeProfileCommand) =>
      profileApi.save(profile.employee.id, command),
    retry: false,
    onSuccess: async () => {
      await refreshProfiles(client);
      onClose();
    },
  });
  const conflict =
    mutation.error instanceof ApiError && mutation.error.code === 'EMPLOYEE_VERSION_CONFLICT';
  const form = useForm({
    defaultValues: saved.draft,
    validators: {
      onChange: profileFormSchema(section, saved.version),
      onSubmit: profileFormSchema(section, saved.version),
    },
    onSubmit: ({ value }) => {
      if (
        conflict ||
        mutation.isPending ||
        !sectionChanged(section, value, saved.draft, saved.version)
      )
        return;
      const command = sectionCommand(section, value, saved.version);
      if (command.success) mutation.mutate(command.data);
    },
  });
  const draft = useStore(form.store, (state) => state.values);
  const changed = sectionChanged(section, draft, saved.draft, saved.version);
  const latestQuery = useQuery({
    queryKey: [...profileKey(profile.employee.id), 'conflict', saved.version],
    queryFn: ({ signal }) => profileApi.get(profile.employee.id, signal),
    enabled: conflict,
    retry: false,
  });
  const latest = conflict ? latestQuery.data : undefined;
  return {
    form,
    changed,
    mutation,
    conflict,
    latestQuery,
    latest,
    reset() {
      if (!changed || mutation.isPending || conflict) return;
      form.reset(saved.draft);
      mutation.reset();
    },
    acknowledgeLatest() {
      if (!latest || mutation.isPending) return;
      setSaved({ draft: profileDraft(latest), version: latest.version });
      mutation.reset();
    },
  };
}
