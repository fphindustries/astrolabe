import {
  createCheckerFromEnv,
  createPlannerFromEnv,
  createProviderFromEnv,
} from '../ai/create-provider.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDb, databaseUrlFromEnv } from '../db/index.js';

import { buildApp } from './app.js';
import { prepareDatabase } from './startup.js';

/**
 * The server entry point (task 5.0). `npm run dev --workspace @astrolabe/server`
 * points here.
 *
 * Migrates on start, the same as the harness (`harness/cli.ts`) does, so a
 * fresh database is never a separate manual step for local development.
 */
async function main(): Promise<void> {
  const sql = createDb(databaseUrlFromEnv());
  await prepareDatabase(sql);

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
