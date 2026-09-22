import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { OperatorRole } from '@vakhta/domain';
import {
  CreateOperatorCommand,
  AcceptOperatorInvitation,
  Password,
  OperatorInvitationError,
} from '@vakhta/contracts';
import { z } from 'zod';
import { ControlApiError, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { invitationApi } from '../api/invitations';

export function invitationError(error: unknown): string {
  if (error instanceof ControlApiError) {
    if (error.code === OperatorInvitationError.OPERATOR_EXISTS)
      return t().operatorInvitations.exists;
    if (error.code === OperatorInvitationError.INVITATION_UNAVAILABLE)
      return t().operatorInvitations.unavailable;
  }
  return t().operatorInvitations.failed;
}

export function useCreateOperator() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: invitationApi.create,
    retry: false,
    gcTime: 0,
    networkMode: 'always',
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.operators });
    },
  });
  const form = useForm({
    defaultValues: { name: '', email: '', role: OperatorRole.PLATFORM_VIEWER as OperatorRole },
    validators: { onChange: CreateOperatorCommand },
    onSubmit: ({ value }) => {
      if (!mutation.isPending && !mutation.data)
        mutation.mutate(CreateOperatorCommand.parse(value));
    },
  });
  return { form, mutation };
}

const PasswordForm = z
  .object({ password: Password, confirm: z.string() })
  .refine((value) => value.password === value.confirm, { path: ['confirm'] });
export function useAcceptInvitation(token: string) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: invitationApi.accept,
    retry: false,
    gcTime: 0,
    networkMode: 'always',
    onSuccess: async () => {
      form.reset();
      mutation.reset();
      client.removeQueries({ queryKey: ['operator-invitation'] });
      await navigate({ to: '/invite', search: { done: true }, replace: true });
    },
  });
  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    validators: { onChange: PasswordForm },
    onSubmit: ({ value }) => {
      if (!mutation.isPending)
        mutation.mutate(AcceptOperatorInvitation.parse({ token, password: value.password }));
    },
  });
  return { form, mutation };
}
