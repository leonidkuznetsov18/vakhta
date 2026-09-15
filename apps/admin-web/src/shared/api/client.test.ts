import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { Blob as NodeBlob } from 'node:buffer';
import { apiRequest, apiBlob, ApiError } from './index';
import { apiFetch } from '@/api';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
afterEach(() => vi.unstubAllGlobals());

describe('shared Axios transport', () => {
  it('sends cookies, locale, JSON and custom headers through the standard Fetch adapter', async () => {
    let request: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        request = input;
        return json({ ok: true });
      }),
    );
    await expect(
      apiFetch('/command', {
        method: 'POST',
        body: '{"name":"Test"}',
        headers: new Headers({ 'if-match': 'revision' }),
      }),
    ).resolves.toEqual({ ok: true });
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('x-locale')).toBe('ru');
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.headers.get('if-match')).toBe('revision');
    expect(await request?.text()).toBe('{"name":"Test"}');
  });
  it('omits cookies for Telegram questionnaire authentication', async () => {
    let request: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        request = input;
        return json({});
      }),
    );
    await apiFetch('/questionnaires/one', {
      credentials: 'omit',
      headers: { authorization: 'tma test' },
    });
    expect(request?.credentials).toBe('omit');
    expect(request?.headers.get('authorization')).toBe('tma test');
  });
  it('does not send content-type for bodyless operations and accepts 204', async () => {
    let request: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        request = input;
        return new Response(null, { status: 204 });
      }),
    );
    await expect(apiFetch('/avatar', { method: 'DELETE' })).resolves.toBeNull();
    expect(request?.headers.has('content-type')).toBe(false);
    expect(request?.body).toBeNull();
  });
  it('lets the browser set the multipart boundary', async () => {
    let request: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        request = input;
        return json({});
      }),
    );
    const data = new FormData();
    data.append('label', 'attachment');
    await apiRequest({ url: '/attachments', method: 'POST', data });
    expect(request?.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect((await request?.formData())?.get('label')).toBe('attachment');
  });
  it.each([401, 403, 409, 422, 500])(
    'preserves HTTP %s and validated domain codes',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ code: 'CONFLICT', message: 'Changed' }, status)),
      );
      await expect(apiRequest({ url: '/data' })).rejects.toMatchObject({
        status,
        code: 'CONFLICT',
        kind: 'http',
      });
    },
  );
  it('preserves an HTTP failure even when the proxy returns HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>secret upstream</html>', { status: 502 })),
    );
    await expect(apiRequest({ url: '/data' })).rejects.toMatchObject({
      status: 502,
      code: null,
      message: 'API request failed',
    });
  });
  it('rejects malformed successful JSON instead of returning a usable value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('{invalid', { headers: { 'content-type': 'application/json' } }),
      ),
    );
    await expect(apiRequest({ url: '/data' })).rejects.toMatchObject({
      status: 200,
      kind: 'response',
    });
  });
  it('normalizes network failures without exposing their request or message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch secret');
      }),
    );
    try {
      await apiRequest({ url: '/data' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 0, kind: 'network' });
      expect(JSON.stringify(error)).not.toContain('secret');
      expect(error).not.toHaveProperty('config');
    }
  });
  it('preserves cancellation and does not dispatch an already aborted request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await apiRequest({ url: '/data', signal: controller.signal }).catch((error: unknown) => {
      expect(axios.isCancel(error)).toBe(true);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts a pending request and never retries a mutation', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (input: Request) =>
        new Promise<Response>((_resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
          controller.abort();
        }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      apiRequest({ url: '/command', method: 'POST', data: {}, signal: controller.signal }),
    ).rejects.toSatisfy(axios.isCancel);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('normalizes a transport timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (input: Request) =>
          new Promise<Response>((_resolve, reject) => {
            input.signal.addEventListener('abort', () => reject(input.signal.reason), {
              once: true,
            });
          }),
      ),
    );
    await expect(apiRequest({ url: '/data', timeout: 10 })).rejects.toMatchObject({
      kind: 'timeout',
      status: 0,
    });
  });
  it('retains JSON domain errors for binary downloads', async () => {
    // Node Response.blob returns the native Blob; jsdom's older Blob lacks text().
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'REVISION_CONFLICT' }, 409)),
    );
    await expect(apiBlob({ url: '/export' })).rejects.toMatchObject({
      status: 409,
      code: 'REVISION_CONFLICT',
    });
  });
});
