import { avatarUrl } from '@/entities/employee';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { UserAvatar } from '@/components/app/avatar';
import { InfoTip } from '@/components/app/info-tip';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/shared/ui/loading-state';
import { profileApi, refreshProfiles } from '../model/api';
import { profileError } from '../model/editor';
export function AvatarControl({
  profile,
  mode = 'read',
}: {
  profile: EmployeeProfileView;
  mode?: 'read' | 'edit';
}) {
  const t = messages(currentLocale()).employeeProfile;
  const [file, setFile] = useState<File | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (photo: File | null) =>
      profileApi.avatar(profile.employee.id, photo, profile.version),
    retry: false,
    onSuccess: async () => {
      setFile(null);
      await refreshProfiles(client);
    },
  });
  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <UserAvatar
        name={profile.employee.fullName}
        email={profile.employee.id}
        image={avatarUrl(profile.employee.id, profile.avatarVersion)}
        className="size-20 rounded-xl"
      />
      {mode === 'edit' && profile.access.personalEdit && (
        <>
          <div className="flex items-center gap-2">
            <label className="relative inline-flex cursor-pointer rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
              <span className="font-medium">{t.upload}</span>
              <input
                className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                aria-label={t.upload}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={mutation.isPending}
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) {
                    setFile(picked);
                    mutation.mutate(picked);
                  }
                }}
              />
            </label>
            <InfoTip text={t.avatarHint} />
          </div>
          {profile.avatarVersion && (
            <Button
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              {t.removeAvatar}
            </Button>
          )}
        </>
      )}
      {mutation.isPending && <LoadingState />}
      {mutation.isError && (
        <div className="max-w-60 text-sm text-destructive" role="alert">
          {profileError(mutation.error)}
          {file && (
            <Button variant="outline" size="sm" onClick={() => mutation.mutate(file)}>
              {messages(currentLocale()).ui.common.retry}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
