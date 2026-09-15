import * as z from 'zod';

import { OracleIdSchema } from '../ids.js';

/**
 * Answering one setting truth (task 4.2, D-31): pick, roll, or write, per
 * question. `oracleId` names which truth question this answers — a truth is
 * imported as an `OracleTable` (`rules/src/adapter/truths.ts`), so it lives
 * in the same `oracle:` namespace `OracleIdSchema` already validates; there
 * is no separate truth ID type.
 *
 * `text` is always the resolved answer — a picked or rolled option's row
 * text, or the player's own words — so a reader never has to re-derive it
 * from `roll`. `roll` is the die result, present only when `source` is
 * `'rolled'`, kept for the same "show your work" reason `dice.rolled`
 * carries its own numbers rather than making a reader recompute them.
 */
export const TruthSetSchema = z.object({
  oracleId: OracleIdSchema,
  source: z.enum(['picked', 'rolled', 'written']),
  text: z.string().min(1),
  roll: z.int().min(1).max(100).optional(),
});
