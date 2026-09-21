import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlApiError, controlApi, CONTROL_API_URL } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('control API boundary', () => {
  it('includes the operator session and validates the operator response', async () => {
    const operator = {
      id: 'b0000000-0000-4000-8000-000000000001',
      email: 'ops@example.test',
      name: 'Operator',
      role: 'PLATFORM_ADMIN',
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(operator));
    vi.stubGlobal('fetch', fetch);

    await expect(controlApi.me()).resolves.toEqual(operator);
    expect(fetch).toHaveBeenCalledWith(`${CONTROL_API_URL}/control/operators/me`, {
      credentials: 'include',
      headers: {},
    });
  });

  it('rejects malformed successful responses instead of treating them as an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ tenants: [] })));
    await expect(controlApi.tenants()).rejects.toThrow();
  });

  it('preserves authorization status and the stable error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'TOTP_REQUIRED', message: 'Second factor required' },
            { status: 403 },
          ),
        ),
    );
    await expect(controlApi.me()).rejects.toEqual(
      new ControlApiError(403, 'TOTP_REQUIRED', 'Second factor required'),
    );
  });

  it('submits a second-factor verification once without trusting the device', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: true }));
    vi.stubGlobal('fetch', fetch);
    await controlApi.verifyTotp('123456');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${CONTROL_API_URL}/auth/two-factor/verify-totp`,
      {
        method: 'POST',
        body: JSON.stringify({ code: '123456', trustDevice: false }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      },
    );
  });

  it('does not retry a failed mutation', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Network unavailable'));
    vi.stubGlobal('fetch', fetch);
    await expect(controlApi.provision('tenant-id')).rejects.toThrow('Network unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
