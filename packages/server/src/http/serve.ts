import { createCheckerFromEnv, createProviderFromEnv } from '../ai/create-provider.js';
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

  const ai = createProviderFromEnv();
  const checker = createCheckerFromEnv();
  const app = buildApp({ sql, ai, checker });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Astrolabe server listening on :${port}`);
  console.log(
    `AI provider: ${ai.name} (${ai.model})${ai.configured ? '' : ' — not configured, play starts paused'}`,
  );
  console.log(`Authority checker: ${checker.name} (${checker.model})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
