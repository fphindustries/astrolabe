import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  LOCAL_PLAYER_ID,
  type Actor,
  type AstrolabeEvent,
  type CampaignId,
  type CommandId,
  type LaunchWorkspaceResponse,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import {
  addSectorLocation,
  addSectorRoute,
  createCampaign,
  swearIncitingVow,
} from '../db/campaign-commands.js';
import { readEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { uuidv7 } from '../db/uuid.js';
import { buildApp } from '../http/app.js';

import { createLegacyCharacter } from './legacy-character.js';
import { appendMilestoneOneLog } from './legacy-log.js';

/**
 * A43 on a Milestone 1 log (10.1d, D-206).
 *
 * The frozen log stands in for the commands D-206 retires. The first test
 * diffs it against those commands while they still exist; 10.1e removes the
 * commands and that test with them.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;

/** Events as a comparable shape: every id replaced by the order it first appeared in. */
function shape(events: readonly AstrolabeEvent[]) {
  const tokens = new Map<string, string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const token = (value: unknown): unknown => {
    if (typeof value === 'string' && uuid.test(value)) {
      if (!tokens.has(value)) tokens.set(value, `#${tokens.size + 1}`);
      return tokens.get(value);
    }
    if (Array.isArray(value)) return value.map(token);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, token(v)]));
    return value;
  };
  return events.map((event) => ({ type: event.type, payload: token(event.payload) }));
}

describe.skipIf(!hasTestDatabase)('a Milestone 1 campaign, frozen (10.1d, A43)', () => {
  let db: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('legacy_log');
    app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('is what the Milestone 1 commands wrote (removed with them in 10.1e)', async () => {
    const commanded = newId<CampaignId>();
    const base = { campaignId: commanded, actor: PLAYER };
    await createCampaign(db.sql, { ...base, commandId: newId<CommandId>(), name: 'Lantern Wake' });
    for (const [name, callsign, stats, assets, pronouns] of [
      [
        'Vesna Kade',
        'Vesna',
        { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 },
        ['asset:path/ace', 'asset:path/navigator', 'asset:module/sensor-array'],
        'she/her',
      ],
      [
        'Rook Ilari',
        'Rook',
        { edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 },
        ['asset:path/veteran', 'asset:path/armored', 'asset:path/gunner'],
        undefined,
      ],
      [
        'Juno Marr',
        'Juno',
        { edge: 1, heart: 1, iron: 2, shadow: 2, wits: 3 },
        ['asset:path/gearhead', 'asset:path/scavenger', 'asset:companion/utility-bot'],
        undefined,
      ],
    ] as const)
      await createLegacyCharacter(db.sql, {
        ...base,
        commandId: newId<CommandId>(),
        draft: { name, callsign, stats, assets: assets as never },
        ...(pronouns === undefined ? {} : { pronouns }),
      });
    const place = async (name: string, description: string) =>
      (
        await addSectorLocation(db.sql, {
          ...base,
          commandId: newId<CommandId>(),
          name,
          description,
        })
      ).locationId;
    const anchorage = await place(
      'Deepwater Anchorage',
      'A ring of lashed-together hulls where the crew trades.',
    );
    const drift = await place('Kessel Drift', 'A slow river of broken ice and old wreckage.');
    const relay = await place('Varga Relay', 'A derelict relay station at the edge of the sector.');
    for (const [from, to] of [
      [anchorage, drift],
      [drift, relay],
    ] as const)
      await addSectorRoute(db.sql, {
        ...base,
        commandId: newId<CommandId>(),
        fromLocationId: from,
        toLocationId: to,
      });
    await swearIncitingVow(db.sql, {
      ...base,
      commandId: newId<CommandId>(),
      title: "Recover the flight recorder of Meridian's Hope",
      rank: 'formidable',
    });

    const frozen = newId<CampaignId>();
    await appendMilestoneOneLog(db.sql, {
      campaignId: frozen,
      name: 'Lantern Wake',
      inPlay: false,
    });

    // `truth.set` has had no command since D-183, so only the frozen log has it.
    const withoutTruths = (events: readonly AstrolabeEvent[]) =>
      events.filter((event) => event.type !== 'truth.set');
    expect(shape(withoutTruths(await readEvents(db.sql, frozen)))).toEqual(
      shape(await readEvents(db.sql, commanded)),
    );
  });

  const workspace = async (campaignId: CampaignId) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/launch`,
    });
    expect(response.statusCode).toBe(200);
    return response.json<LaunchWorkspaceResponse>();
  };

  it('opens Finish campaign launch with everything it had, while no session exists', async () => {
    const campaignId = newId<CampaignId>();
    const run = await appendMilestoneOneLog(db.sql, { campaignId, name: 'Old', inPlay: false });

    const body = await workspace(campaignId);

    // Open, so the client sends it to Finish campaign launch rather than play.
    expect(body).toMatchObject({ launchOpen: true });
    expect(body.state.launch.phase).toBe('draft');
    // D-183: the legacy truths fold into the same decisions a launch makes.
    expect(Object.keys(body.state.launch.truthDecisions)).toHaveLength(3);
    // D-193: the crew keeps its members, the granted Starship off each sheet.
    expect(Object.keys(body.state.characters)).toEqual(
      expect.arrayContaining(Object.values(run.characters)),
    );
    for (const character of Object.values(body.state.characters))
      expect(character).toMatchObject({ legacyStarshipGrant: true });
    expect(
      Object.values(body.state.entities)
        .filter((entity) => entity.kind === 'location')
        .map((entity) => entity.name),
    ).toEqual(['Deepwater Anchorage', 'Kessel Drift', 'Varga Relay']);
    expect(body.state.sector.routes).toHaveLength(2);
    expect(body.state.tracks[run.vowId]).toMatchObject({ kind: 'vow', rank: 'formidable' });
    // Its blockers are reported, not thrown: what it still needs is the workspace's to say.
    expect(body.readiness.ready).toBe(false);
  });

  it('opens play, launch closed, once it has a session', async () => {
    const campaignId = newId<CampaignId>();
    await appendMilestoneOneLog(db.sql, { campaignId, name: 'Old, in play', inPlay: true });

    const body = await workspace(campaignId);

    expect(body).toMatchObject({ launchOpen: false, closedReason: 'campaign_in_play' });
    // The phase alone would have said `draft` and sent A43 to the wrong screen.
    expect(body.state.launch.phase).toBe('draft');
    expect(body.state.scene?.title).toBe('A beacon at Deepwater Anchorage');
  });
});
