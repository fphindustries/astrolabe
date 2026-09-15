import postgres, { type Sql } from 'postgres';

/**
 * The database connection.
 *
 * Milestone 1 has no auth and one local user (D-52), so there is one
 * connection string and no per-request identity. The pool is small on
 * purpose: solo play is one writer, and every write to a campaign
 * serialises on that campaign's row anyway (see the sequence in task 2.3).
 */
export interface DbOptions {
  readonly max?: number;
  /** Postgres notices and slow queries. Off unless asked for. */
  readonly debug?: boolean;
}

export function createDb(url: string, options: DbOptions = {}): Sql {
  return postgres(url, {
    max: options.max ?? 5,
    // Postgres emits a NOTICE for every `if not exists` that finds the
    // object already there, which means one on every migration run. None of
    // them are actionable, and printing them trains people to ignore the
    // output. `debug` puts them back.
    ...(options.debug === true ? { debug: console.log } : { onnotice: () => {} }),
  });
}

/**
 * A `timestamptz` comes back from the driver as a `Date`, but an event's
 * `occurredAt` is an ISO string: it is assigned once at write time, never
 * re-read by the projector, and the projector is banned from touching
 * `Date` at all.
 *
 * The conversion happens here, at the row-mapping boundary, rather than by
 * overriding the driver's type parser. Explicit beats clever, and this is
 * the kind of thing that should be visible in the one function that turns
 * a row into an event (task 2.3) rather than hidden in connection options.
 */
export function toTimestamp(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * The connection string, from the environment.
 *
 * Throws rather than defaulting to localhost: a server that silently
 * connects to the wrong database is worse than one that refuses to start.
 */
export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. For local development: `docker compose up -d db`, then ' +
        'DATABASE_URL=postgres://astrolabe:astrolabe@localhost:5433/astrolabe',
    );
  }
  return url;
}
