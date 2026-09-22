import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import {
  OperatorInvitationView,
  OperatorInvitationDetails,
  type CreateOperatorCommand,
  type AcceptOperatorInvitation,
} from '@vakhta/contracts';
import { request, controlApi, queryKeys } from '@/shared/api';

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
export const invitationApi = {
  create: (body: CreateOperatorCommand) =>
    request(OperatorInvitationView, '/control/operators', post(body)),
  reissue: (id: string) =>
    request(OperatorInvitationView, `/control/operators/${id}/invitations`, post({})),
  accept: (body: AcceptOperatorInvitation) =>
    request(z.object({ ok: z.literal(true) }), '/public/operator-invitations/accept', post(body)),
};
export const operatorQueries = {
  list: () => queryOptions({ queryKey: queryKeys.operators, queryFn: controlApi.operators }),
  me: () => queryOptions({ queryKey: queryKeys.me, queryFn: controlApi.me }),
  invitation: (token: string) =>
    queryOptions({
      queryKey: ['operator-invitation', token] as const,
      queryFn: ({ signal }) =>
        request(OperatorInvitationDetails, '/public/operator-invitations/inspect', {
          ...post({ token }),
          signal,
        }),
      retry: false,
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
      enabled: Boolean(token),
    }),
};
