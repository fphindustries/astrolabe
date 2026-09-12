import { createDb, databaseUrlFromEnv, migrate } from '../db/index.js';

import { buildApp } from './app.js';

/**
 * The server entry point (task 5.0). `npm run dev --workspace @astrolabe/server`
 * points here.
 *
 * Migrates on start, the same as the harness (`harness/cli.ts`) does, so a
 * fresh database is never a separate manual step for local development.
 */
async function main(): Promise<void> {
  const sql = createDb(databaseUrlFromEnv());
  await migrate(sql);

  const app = buildApp({ sql });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Astrolabe server listening on :${port}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
