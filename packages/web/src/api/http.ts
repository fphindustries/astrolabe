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

export const apiPost = <T>(path: string, body: unknown) => send<T>('POST', path, body);

/**
 * PUT, for the writes that replace what is already there rather than adding to
 * it: a section's saved draft and the sector's map layout. Which verb a launch
 * route takes is the server's statement about the write, so the client matches
 * it rather than posting everything.
 */
export const apiPut = <T>(path: string, body: unknown) => send<T>('PUT', path, body);

/**
 * DELETE with a body, which is unusual and deliberate: removing a crew member
 * before launch is append-only like every other launch change (A40), so the
 * command carries the reason the log has to record. The verb says what the
 * caller means; the body says why.
 */
export const apiDelete = <T>(path: string, body: unknown) => send<T>('DELETE', path, body);

async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
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
