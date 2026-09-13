import * as z from 'zod';

import { OracleIdSchema } from '../ids.js';

/**
 * A server-rolled oracle table result (design-event-log.md §2: "stores the
 * roll value and the row text, so regenerating Datasworn cannot change what
 * an old campaign's oracle said").
 *
 * Introduced by task 6.8 for Pay the Price's table method (Beat 7) — the
 * first caller that needs an oracle roll of its own, ahead of group 8's
 * broader oracle-grounded generation, which reuses this type unchanged for
 * NPC/location/faction rolls and AI-set odds.
 *
 * A discarded reroll is `event.voided { kind: 'reroll' }` pointing at the
 * `oracle.rolled` it discarded (D-70) — not a field here.
 */
export const OracleRolledSchema = z.object({
  oracleId: OracleIdSchema,
  roll: z.int().min(1).max(100),
  rowText: z.string().min(1),
});
