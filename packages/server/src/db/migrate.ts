import type { Sql } from 'postgres';

import { migration001 } from './migrations/001-event-log.js';

/**
 * A hand-written migration runner. No framework (CLAUDE.md), and no
 * runtime filesystem access either: a migration is a TypeScript module
 * exporting its SQL, so it compiles and resolves exactly like every other
 * module, under `tsx` and under `node dist/` alike.
 *
 * The alternative — `.sql` files read with `fs` — reads slightly better but
 * needs an asset-copying build step to survive `tsc`, and would be the only
 * thing in the repo that does. Section 1 made the same trade for the
 * Datasworn artifact, and for the same reason.
 */
export interface Migration {
  /** Zero-padded and ordered: '001', '002'. Recorded, so it must never change. */
  readonly id: string;
  readonly name: string;
  readonly sql: string;
}

/**
 * Every migration, in the order they apply. Append only — an applied
 * migration is a fact about every database that has run it, so editing one
 * changes history that other databases have already recorded.
 */
export const MIGRATIONS: readonly Migration[] = [migration001];

export interface MigrationOutcome {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

/**
 * Postgres advisory lock key. Two servers starting at once would otherwise
 * both see a migration as unapplied and both try to run it; the second
 * fails on a duplicate object rather than waiting. An arbitrary but fixed
 * number, namespaced to this application.
 */
const MIGRATION_LOCK_KEY = 0x4153_5442; // "ASTB"

/**
 * Apply every migration that has not run yet, in order.
 *
 * The whole run is one transaction, together with the rows that record it,
 * so the schema and the claim about what the schema is commit or fail as
 * one. Postgres has transactional DDL, which is what makes that possible —
 * a half-applied schema is not a state this can reach.
 *
 * One transaction for the batch rather than one per migration, because the
 * advisory lock below has to be held across the read-then-apply window and
 * a transaction-scoped lock is the only kind that cannot be stranded on a
 * pooled connection. The cost is that a failure part-way through a batch
 * rolls back the earlier migrations in that batch too — which for a fresh
 * database is the same thing, and for an upgrade is the safer answer.
 */
export async function migrate(
  sql: Sql,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationOutcome> {
  assertOrdered(migrations);

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  await sql.begin(async (tx) => {
    // Transaction-scoped, not session-scoped. `sql` is a pool, so a
    // `pg_advisory_lock` taken on one pooled connection could be released
    // on a different one — stranding the lock and silently failing the
    // unlock. An xact lock is held by the transaction, released when it
    // ends either way, and cannot be split across connections.
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY}::bigint)`;

    await tx`
      create table if not exists schema_migrations (
        id          text primary key,
        name        text not null,
        applied_at  timestamptz not null default now()
      )
    `;

    const rows = await tx<{ id: string }[]>`select id from schema_migrations`;
    const done = new Set(rows.map((row) => row.id));

    for (const migration of migrations) {
      if (done.has(migration.id)) {
        alreadyApplied.push(migration.id);
        continue;
      }
      await tx.unsafe(migration.sql);
      await tx`
        insert into schema_migrations (id, name) values (${migration.id}, ${migration.name})
      `;
      applied.push(migration.id);
    }
  });

  return { applied, alreadyApplied };
}

/**
 * A duplicate or out-of-order id means the list has been edited rather than
 * appended to, which would apply migrations in an order no existing
 * database has seen. Cheaper to catch here than in production.
 */
function assertOrdered(migrations: readonly Migration[]): void {
  const ids = migrations.map((m) => m.id);
  const sorted = [...ids].sort();
  if (ids.join() !== sorted.join()) {
    throw new Error(`Migrations are out of order: ${ids.join(', ')}`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Migrations have duplicate ids: ${ids.join(', ')}`);
  }
}
