import { OnboardingView } from '@vakhta/contracts';
import { CONTROL_API_URL } from '@/shared/config';

export class InvitationUnavailable extends Error {}

async function request(token: string, password?: string): Promise<OnboardingView> {
  const response = await fetch(
    `${CONTROL_API_URL}/public/onboarding/${password === undefined ? 'inspect' : 'accept'}`,
    {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, host: location.host, password }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.status === 409) throw new InvitationUnavailable();
  if (!response.ok) throw new Error('Onboarding request failed');
  return OnboardingView.parse(await response.json());
}
export const inspectInvitation = (token: string) => request(token);
export const acceptInvitation = (token: string, password: string) => request(token, password);
