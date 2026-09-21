import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SetTenantAdministratorPassword } from '@vakhta/contracts';
import { queryKeys } from '@/shared/api';
import { administratorApi } from '../api/administrators';
import { administratorError, generatePassword } from './password';

export function usePassword(tenantId: string, userId: string) {
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: administratorApi.password,
    retry: false,
    gcTime: 0,
    networkMode: 'always',
    onSuccess: () => {
      setSaved(true);
      mutation.reset();
      void client.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
    },
  });
  const copy = useMutation({
    mutationFn: () => navigator.clipboard.writeText(password),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  const valid = SetTenantAdministratorPassword.safeParse({ password }).success;
  const canSave = valid && !mutation.isPending && !saved;
  return {
    password,
    visible,
    saved,
    canSave,
    busy: mutation.isPending,
    error: mutation.error ? administratorError(mutation.error) : null,
    copyFailed: copy.isError,
    copied: copy.isSuccess,
    toggleVisible: () => setVisible(!visible),
    change: (value: string) => {
      if (!mutation.isPending && !saved) {
        setPassword(value);
        copy.reset();
      }
    },
    generate: () => {
      setPassword(generatePassword());
      setVisible(true);
      copy.reset();
    },
    copy: () => copy.mutate(),
    submit: () => {
      if (canSave) mutation.mutate({ tenantId, userId, command: { password } });
    },
  };
}
