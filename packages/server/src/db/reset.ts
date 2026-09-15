import type { Sql } from 'postgres';

/**
 * Wipe the store by dropping its schema and creating it again (D-122).
 *
 * Drop-and-replay, not delete. The events table is INSERT-only, and its
 * triggers refuse `DELETE` and `TRUNCATE` for good reason. Nothing here
 * weakens them. Dropping the schema removes the tables rather than mutating
 * their rows, which is the same move `db/testing.ts` makes when a test
 * schema is thrown away.
 *
 * It acts on the connection's current schema — `public` for the dev
 * database, a test schema under `createTestDatabase` — so it can be tested
 * without touching anyone's data. The caller migrates and seeds afterwards.
 */
export async function resetSchema(sql: Sql): Promise<string> {
  const [row] = await sql<{ schema: string | null }[]>`select current_schema() as schema`;
  const schema = row?.schema;
  if (schema === undefined || schema === null) {
    throw new Error('The connection has no current schema to reset.');
  }
  const quoted = `"${schema.replaceAll('"', '""')}"`;
  await sql.begin(async (tx) => {
    await tx.unsafe(`drop schema ${quoted} cascade`);
    await tx.unsafe(`create schema ${quoted}`);
  });
  return schema;
}

export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
  readonly events: number;
}

/** What a reset would destroy, so the CLI can say so before it does. */
export async function summariseCampaigns(sql: Sql): Promise<readonly CampaignSummary[]> {
  const [exists] = await sql<{ present: boolean }[]>`
    select to_regclass('campaigns') is not null as present
  `;
  if (exists?.present !== true) {
    return [];
  }
  const rows = await sql<{ id: string; name: string; events: string }[]>`
    select c.id, c.name, count(e.seq) as events
      from campaigns c
      left join events e on e.campaign_id = c.id
     group by c.id, c.name, c.created_at
     order by c.created_at
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, events: Number(row.events) }));
}
