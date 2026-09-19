import type { Sql } from 'postgres';

import { migrate } from '../db/index.js';

/**
 * What the server does to its database before it listens: migrate, and
 * nothing else (10.6, D-170).
 *
 * D-158 once seeded the example campaigns into a fresh production database
 * here, as a stopgap until creating a campaign was a complete first run. The
 * launch is that now, so a fresh install opens the new-campaign path, and an
 * existing database keeps every campaign it has, seeded ones included. The
 * fixtures stay for development: `db:seed` and `db:reset`, which refuse under
 * `NODE_ENV=production` (`fixtures/cli.ts`).
 */
export async function prepareDatabase(sql: Sql): Promise<void> {
  await migrate(sql);
}
