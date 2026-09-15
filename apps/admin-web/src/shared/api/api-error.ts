import axios from 'axios';
import { z } from 'zod';

export type ApiFailureKind = 'http' | 'network' | 'timeout' | 'response';

/** Stable application failure; deliberately excludes credentials, request bodies and response data. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly kind: ApiFailureKind = status === 0 ? 'network' : 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const envelope = z.object({ code: z.string().optional(), message: z.string().optional() });

async function errorBody(data: unknown): Promise<unknown> {
  if (!(data instanceof Blob)) return data;
  try {
    return JSON.parse(await data.text()) as unknown;
  } catch {
    // An HTML proxy error or invalid JSON still has an actionable HTTP status.
    return null;
  }
}

export async function normalizeApiError(error: unknown): Promise<never> {
  // Preserve the library's cancellation identity. Cancellation is not a server failure.
  if (axios.isCancel(error) || !axios.isAxiosError<unknown>(error)) throw error;
  const status = error.response?.status ?? 0;
  if (status >= 400) {
    const parsed = envelope.safeParse(await errorBody(error.response?.data));
    throw new ApiError(
      status,
      parsed.success ? (parsed.data.code ?? null) : null,
      parsed.success ? (parsed.data.message ?? 'API request failed') : 'API request failed',
    );
  }
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED')
    throw new ApiError(0, null, 'API request timed out', 'timeout');
  if (error.code === 'ERR_NETWORK') throw new ApiError(0, null, 'API is unreachable', 'network');
  throw new ApiError(status, null, 'API returned an invalid response', 'response');
}
