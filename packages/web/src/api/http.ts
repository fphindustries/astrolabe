/**
 * The fetch wrapper every API call goes through.
 *
 * Deliberately small: JSON in and out, a typed error carrying the status
 * and body, and the `/api` base that Vite's dev server proxies to the
 * server (task 5.0). No retry logic here — react-query's own retry policy
 * is what governs that, set once in `query-client.ts`.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await safeJson(response));
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await safeJson(response));
  }
  return (await response.json()) as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
