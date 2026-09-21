import { queryOptions } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { inspectInvitation } from './onboarding';

const keys = {
  invitation: (token: string) => ['onboarding', token],
  qr: (url: string | null) => ['onboarding-qr', url],
};
export const welcomeQueries = {
  invitation: (token: string) =>
    queryOptions({
      queryKey: keys.invitation(token),
      queryFn: () => inspectInvitation(token),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  qr: (url: string | null) =>
    queryOptions({
      queryKey: keys.qr(url),
      queryFn: () => QRCode.toDataURL(url ?? '', { width: 208, margin: 2 }),
      enabled: Boolean(url),
      staleTime: Infinity,
    }),
};
