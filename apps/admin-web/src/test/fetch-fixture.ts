/** Adapt old URL/options fixtures to the Fetch API's standard Request input. Preview/test only. */
export function fetchFixture(
  handle: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return async (input, init) => {
    if (!(input instanceof Request)) return handle(String(input), init);
    const body =
      input.body === null
        ? undefined
        : input.headers.get('content-type')?.includes('multipart/form-data')
          ? await input.clone().formData()
          : await input.clone().text();
    return handle(input.url, {
      method: input.method,
      headers: Object.fromEntries(input.headers),
      credentials: input.credentials,
      signal: input.signal,
      ...(body !== undefined ? { body } : {}),
      ...init,
    });
  };
}
