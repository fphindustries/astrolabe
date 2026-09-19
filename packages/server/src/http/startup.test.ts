import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';

import { prepareDatabase } from './startup.js';

/** 10.6 (D-170): a fresh production install opens the new-campaign path, empty. */
describe.skipIf(!hasTestDatabase)('server startup (10.6, D-170)', () => {
  let db: TestDatabase;
  const environment = process.env['NODE_ENV'];

  beforeAll(async () => {
    db = await createTestDatabase('startup');
  }, 30_000);

  afterAll(async () => {
    process.env['NODE_ENV'] = environment;
    await db?.close();
  });

  it('migrates a fresh production database and inserts no campaign', async () => {
    process.env['NODE_ENV'] = 'production';

    await prepareDatabase(db.sql);
    await prepareDatabase(db.sql);

    expect(await db.sql`select id from campaigns`).toHaveLength(0);
    expect(await db.sql`select id from events`).toHaveLength(0);
  });
});
