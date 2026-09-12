/**
 * `npm run migrate` — apply any outstanding migrations and report what it
 * did. The same `migrate()` the tests use; this is only a way to invoke it
 * from a shell.
 */
import { createDb, databaseUrlFromEnv } from './client.js';
import { migrate } from './migrate.js';

async function main(): Promise<void> {
  const sql = createDb(databaseUrlFromEnv(), { max: 1 });
  try {
    const { applied, alreadyApplied } = await migrate(sql);
    if (applied.length === 0) {
      console.log(`Up to date — ${alreadyApplied.length} migration(s) already applied.`);
    } else {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
