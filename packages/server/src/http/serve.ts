import {
  createCheckerFromEnv,
  createPlannerFromEnv,
  createProviderFromEnv,
} from '../ai/create-provider.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Sql } from 'postgres';

import { createDb, databaseUrlFromEnv, migrate } from '../db/index.js';
import { seedAllFixtures } from '../fixtures/index.js';

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
  await seedIfProduction(sql);

  const ai = createProviderFromEnv();
  const checker = createCheckerFromEnv();
  const planner = createPlannerFromEnv();
  const webRoot = webRootFromEnv();
  const app = buildApp({
    sql,
    ai,
    checker,
    planner,
    ...(webRoot !== undefined ? { webRoot } : {}),
  });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Astrolabe server listening on :${port}`);
  console.log(
    `AI provider: ${ai.name} (${ai.model})${ai.configured ? '' : ' — not configured, play starts paused'}`,
  );
  console.log(`Authority checker: ${checker.name} (${checker.model})`);
  console.log(`Scene planner: ${planner.name} (${planner.model})`);
  console.log(
    webRoot !== undefined ? `Web client: ${webRoot}` : 'Web client: not served (use Vite)',
  );
}

/**
 * D-158, amending D-154: until campaign and character creation are further
 * along, a fresh production install seeds the same example campaigns
 * `db:seed` would, so it isn't just an empty list. `db:seed` and `db:reset`
 * themselves still refuse outright under `NODE_ENV=production` (`fixtures/cli.ts`)
 * — this is a separate, idempotent path that only ever adds a fixture
 * that isn't already there, never drops or replays over real play.
 */
async function seedIfProduction(sql: Sql): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') {
    return;
  }
  const results = await seedAllFixtures(sql);
  for (const { name, description, outcome } of results) {
    if (outcome === 'seeded') {
      console.log(`Seeded ${name}: ${description}`);
    }
  }
}

/**
 * D-154: `ASTROLABE_WEB_ROOT` if set, else the workspace's built client when
 * there is one, so `npm start` after a build serves the whole app.
 */
function webRootFromEnv(): string | undefined {
  const configured = process.env['ASTROLABE_WEB_ROOT'];
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  const built = fileURLToPath(new URL('../../../web/dist/', import.meta.url));
  return existsSync(`${built}index.html`) ? built : undefined;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
