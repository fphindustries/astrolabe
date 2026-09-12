/**
 * The store: the only part of the server that does I/O.
 *
 * `projection/` stays pure and is tested without a database (task 2.4a);
 * everything that touches Postgres lives here and gets a smaller
 * integration suite against a real server.
 */

export { createDb, databaseUrlFromEnv, toTimestamp, type DbOptions } from './client.js';
export { MIGRATIONS, migrate, type Migration, type MigrationOutcome } from './migrate.js';
