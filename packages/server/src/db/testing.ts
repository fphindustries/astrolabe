import postgres, { type Sql } from 'postgres';

import { migrate } from './migrate.js';

/**
 * Integration-test plumbing for the store.
 *
 * The projector is pure and tested without a database at all (task 2.4a).
 * Only the store needs one, and it needs a *real* Postgres: the whole point
 * of task 2.1 is the append-only trigger, transactional DDL and the
 * per-campaign sequence, none of which an in-memory stand-in implements
 * faithfully. A fake here would test the fake.
 *
 * Each test file gets its own schema rather than its own database, so the
 * suite runs in parallel against one server and cleans up after itself.
 */

/** Set when a Postgres is available. See docker-compose.yml. */
export const TEST_DATABASE_URL = process.env['DATABASE_URL'];

export const hasTestDatabase = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';

export const NO_DATABASE_MESSAGE =
  'Skipped: no DATABASE_URL. Run `docker compose up -d db`, then set ' +
  'DATABASE_URL=postgres://astrolabe:astrolabe@localhost:5433/astrolabe';

export interface TestDatabase {
  readonly sql: Sql;
  readonly schema: string;
  /** Drops the schema and closes the connection. */
  close(): Promise<void>;
}

let schemaCounter = 0;

/**
 * A migrated, isolated schema. Call in `beforeAll`, and `close()` in
 * `afterAll`.
 */
export async function createTestDatabase(label: string): Promise<TestDatabase> {
  if (!hasTestDatabase) {
    throw new Error(NO_DATABASE_MESSAGE);
  }
  schemaCounter += 1;
  const schema = `test_${sanitise(label)}_${process.pid}_${schemaCounter}`;

  // A first connection with no search_path, only to create the schema.
  const admin = postgres(TEST_DATABASE_URL as string, { max: 1 });
  try {
    await admin.unsafe(`create schema "${schema}"`);
  } finally {
    await admin.end();
  }

  const sql = postgres(TEST_DATABASE_URL as string, {
    max: 2,
    connection: { search_path: schema },
  });
  await migrate(sql);

  return {
    sql,
    schema,
    async close() {
      await sql.end();
      const cleanup = postgres(TEST_DATABASE_URL as string, { max: 1 });
      try {
        // DROP does not fire the row-level or truncate guards on `events`;
        // those reject mutation of the data, not removal of the table.
        await cleanup.unsafe(`drop schema if exists "${schema}" cascade`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

function sanitise(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 24);
}
