import type { CampaignId } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { GOLDEN_SESSION, GOLDEN_SESSION_CAMPAIGN_ID, playGoldenSession } from './golden-session.js';
import { playSessionOne, SESSION_ONE, SESSION_ONE_CAMPAIGN_ID } from './session-one.js';
import {
  playSessionTwoOpen,
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
} from './session-two-open.js';

/**
 * The fixtures the dev database and the end-to-end test share (D-122).
 *
 * One registry, so `npm run db:seed` and task 10.4's test ask for a campaign
 * by the same name and get the same script.
 */

export interface Fixture {
  readonly name: string;
  readonly description: string;
  readonly campaignId: CampaignId;
  play(sql: Sql): Promise<unknown>;
}

export const FIXTURES: ReadonlyMap<string, Fixture> = new Map(
  [
    {
      name: SESSION_ONE,
      description:
        'Lantern Wake after session 1 — where the golden session begins with Begin Session (D-72, D-146)',
      campaignId: SESSION_ONE_CAMPAIGN_ID,
      play: (sql: Sql) => playSessionOne(sql),
    },
    {
      name: SESSION_TWO_OPEN,
      description: 'the same campaign with session 2 open at Varga Relay, no recap (D-146)',
      campaignId: SESSION_TWO_OPEN_CAMPAIGN_ID,
      play: playSessionTwoOpen,
    },
    {
      name: GOLDEN_SESSION,
      description:
        'the same campaign with session 2 played through all ten beats of the golden session and ended (D-152)',
      campaignId: GOLDEN_SESSION_CAMPAIGN_ID,
      play: playGoldenSession,
    },
  ].map((fixture) => [fixture.name, fixture]),
);

export type SeedOutcome = 'seeded' | 'already_present';

/**
 * Write a fixture's campaign, unless it is already there.
 *
 * "Already there" is judged by the campaign id alone, deliberately: a
 * seeded campaign that has since been played on is still that campaign, and
 * the way back to its seeded state is `db:reset`, not a partial replay over
 * the top of what was played.
 */
export async function seedFixture(sql: Sql, name: string): Promise<SeedOutcome> {
  const fixture = FIXTURES.get(name);
  if (fixture === undefined) {
    throw new Error(`No fixture named "${name}". Known: ${[...FIXTURES.keys()].join(', ')}.`);
  }
  const existing = await sql`select 1 from campaigns where id = ${fixture.campaignId}`;
  if (existing.length > 0) {
    return 'already_present';
  }
  await fixture.play(sql);
  return 'seeded';
}

export interface FixtureSeedResult {
  readonly name: string;
  readonly description: string;
  readonly outcome: SeedOutcome;
}

/**
 * Seed every registered fixture whose campaign isn't there yet — what
 * `db:seed` does with no names given. Used by the CLI and, until campaign
 * and character creation are further along, by the server's own startup
 * seed under `NODE_ENV=production` (D-158, amending D-154). Each call is a
 * no-op past the first: `seedFixture` skips a fixture already present.
 */
export async function seedAllFixtures(sql: Sql): Promise<readonly FixtureSeedResult[]> {
  const results: FixtureSeedResult[] = [];
  for (const [name, fixture] of FIXTURES) {
    results.push({ name, description: fixture.description, outcome: await seedFixture(sql, name) });
  }
  return results;
}

export { fixtureUuid } from './ids.js';
export {
  GOLDEN_SESSION,
  GOLDEN_SESSION_CAMPAIGN_ID,
  playGoldenSession,
  type GoldenSessionRun,
} from './golden-session.js';
export { actionRoll, loadedDice, type Face, type LoadedDice } from './loaded-dice.js';
export {
  playSessionOne,
  SESSION_ONE,
  SESSION_ONE_CAMPAIGN_ID,
  type SessionOneOptions,
  type SessionOneRun,
} from './session-one.js';
export {
  playSessionTwoOpen,
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  type SessionTwoOpenRun,
} from './session-two-open.js';
