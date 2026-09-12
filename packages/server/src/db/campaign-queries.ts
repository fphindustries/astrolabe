import type { CampaignId, CampaignSummary } from '@astrolabe/shared';
import type { Sql } from 'postgres';

/**
 * Reads against the `campaigns` bookkeeping row itself, as opposed to the
 * event log. Kept separate from `event-store.ts`, which is about events.
 *
 * Returns `@astrolabe/shared`'s `CampaignSummary` (task 5.0's API envelope
 * type) directly rather than declaring a second shape here.
 */

/** Every campaign, oldest first. Task 5.0's campaign list has nothing to sort by yet. */
export async function listCampaigns(sql: Sql): Promise<CampaignSummary[]> {
  const rows = await sql<{ id: CampaignId; name: string }[]>`
    select id, name from campaigns order by created_at
  `;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
