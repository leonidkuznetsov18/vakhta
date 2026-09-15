import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { currentLocale } from '@/shared/config';
import { normalizeApiError } from './api-error';

export const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

const client = axios.create({
  baseURL: API_URL,
  adapter: 'fetch',
  // Resolve fetch at dispatch time for standard Request interception in previews and tests.
  env: { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) },
  withCredentials: true,
  responseType: 'json',
  transitional: { silentJSONParsing: false, clarifyTimeoutError: true },
});

client.interceptors.request.use((config) => {
  if (!config.headers.has('x-locale')) config.headers.set('x-locale', currentLocale());
  // Fastify refuses a JSON content type with no body. FormData needs the browser's boundary.
  if (config.data == null || config.data instanceof FormData) config.headers.setContentType(false);
  // The fetch adapter adds `User-Agent: axios/x` unless the header is already set. Chromium drops
  // it, but Safari sends it, so the CORS preflight asks for a header the API does not allow and
  // every cross-origin request from an iPhone is blocked. `false` keeps the browser's own value.
  config.headers.set('User-Agent', false);
  return config;
});
client.interceptors.response.use((response: AxiosResponse<unknown>) => {
  if (response.config.responseType === 'json' && response.data === '') response.data = null;
  return response;
}, normalizeApiError);

/** Transport only. Feature boundaries validate response models with their Zod contracts. */
export async function apiRequest<T, D = unknown>(
  config: AxiosRequestConfig<D>,
  options?: Pick<AxiosRequestConfig<unknown>, 'signal' | 'timeout'>,
): Promise<T> {
  const response = await client.request<T, AxiosResponse<T>, D>({ ...config, ...options });
  return response.data;
}

/** File consumers need headers as well as bytes to validate the expected media type. */
export function apiBlob(config: AxiosRequestConfig<unknown>): Promise<AxiosResponse<Blob>> {
  return client.request<Blob, AxiosResponse<Blob>>({ ...config, responseType: 'blob' });
}

export { ApiError, type ApiFailureKind } from './api-error';
