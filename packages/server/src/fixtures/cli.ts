import { createDb, databaseUrlFromEnv } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { resetSchema, summariseCampaigns } from '../db/reset.js';

import { FIXTURES, seedFixture } from './index.js';

/**
 * `npm run db:seed` and `npm run db:reset` (D-122).
 *
 *   seed [name…]   add fixtures whose campaign isn't there yet (default: all)
 *   reset --yes    drop the schema, migrate, and seed every fixture
 *
 * Reset destroys every campaign in the database, not only the seeded ones,
 * so without `--yes` it lists what it would drop and stops. It refuses
 * outright under NODE_ENV=production.
 */
async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
  const names = rest.filter((arg) => !arg.startsWith('--'));

  if (command !== 'seed' && command !== 'reset') {
    throw new Error('Usage: cli.ts seed [fixture…] | cli.ts reset --yes');
  }

  const sql = createDb(databaseUrlFromEnv(), { max: 2 });
  try {
    if (command === 'reset') {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('Refusing to reset a database under NODE_ENV=production.');
      }
      const doomed = await summariseCampaigns(sql);
      if (!flags.has('--yes')) {
        console.log(describeDoomed(doomed));
        console.log('\nNothing was changed. Run `npm run db:reset -- --yes` to go ahead.');
        process.exitCode = 1;
        return;
      }
      const schema = await resetSchema(sql);
      console.log(
        `Dropped and recreated schema "${schema}" (${doomed.length} campaign(s) removed).`,
      );
    }

    await migrate(sql);
    for (const name of names.length > 0 ? names : [...FIXTURES.keys()]) {
      const outcome = await seedFixture(sql, name);
      const fixture = FIXTURES.get(name);
      console.log(
        outcome === 'seeded'
          ? `Seeded ${name}: ${fixture?.description} — campaign ${fixture?.campaignId}`
          : `${name} is already present (campaign ${fixture?.campaignId}); \`db:reset\` rebuilds it.`,
      );
    }
  } finally {
    await sql.end();
  }
}

function describeDoomed(
  campaigns: readonly { readonly id: string; readonly name: string; readonly events: number }[],
): string {
  if (campaigns.length === 0) {
    return 'The database has no campaigns. A reset would only migrate and seed.';
  }
  return [
    `A reset drops all ${campaigns.length} campaign(s) in this database:`,
    ...campaigns.map((c) => `  ${c.id}  ${c.name} (${c.events} events)`),
  ].join('\n');
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
