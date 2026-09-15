import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSeededRandomSource, type CharacterId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CommandId } from '@astrolabe/shared';

import { resolveBeatScope, describeBeat } from '../ai/context/index.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import {
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { project } from '../projection/project.js';

import { offerComplications, setComplication } from './complication-commands.js';
import { readEvents } from './event-store.js';
import { burnMomentum, invokeMove } from './move-commands.js';
import { AiRequestRefusedError, prepareBeatNarration } from './narration-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const campaignId = SESSION_TWO_OPEN_CAMPAIGN_ID;

const OPTIONS: StubResponse = {
  kind: 'structured',
  value: {
    options: [
      {
        text: 'The station was abandoned, yet one life-support circuit is still drawing power.',
        cites: ['O1.action', 'O1.theme'],
      },
      { text: 'The logs were edited after the evacuation.', cites: ['O2.action', 'O2.theme'] },
      { text: 'Something in the archive is listening back.', cites: ['O3.action', 'O3.theme'] },
    ],
  },
};

describe.skipIf(!hasTestDatabase)('weak-hit complications (8.7, D-15, D-143)', () => {
  let db: TestDatabase;
  let juno: CharacterId;
  let vesna: CharacterId;

  beforeAll(async () => {
    db = await createTestDatabase('complications');
    await seedFixture(db.sql, SESSION_TWO_OPEN);
    const state = project(await readEvents(db.sql, campaignId));
    const byCallsign = (callsign: string) =>
      Object.values(state.characters).find((c) => c.callsign === callsign)!.id;
    juno = byCallsign('Juno');
    vesna = byCallsign('Vesna');
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Beat 3: Juno pulls the station logs, Gather Information, a weak hit. */
  async function weakHit(): Promise<CommandId> {
    const commandId = newId<CommandId>();
    const invoked = await invokeMove(db.sql, {
      campaignId,
      commandId,
      actor: PLAYER,
      moveId: 'move:adventure/gather-information',
      actorCharacterId: juno,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      actionText: 'Juno jacks into the docking port and pulls the station logs.',
      rng: actionRoll(2, [3, 8]),
    });
    expect(invoked.roll.tier).toBe('weak_hit');
    return commandId;
  }

  const offer = (ai: StubProvider, moveCommandId: CommandId, commandId = newId<CommandId>()) =>
    offerComplications(db.sql, ai, {
      campaignId,
      commandId,
      actor: PLAYER,
      moveCommandId,
      rng: createSeededRandomSource(3),
    });

  it('rolls an Action + Theme pair per option and records the options, caused by the move', async () => {
    const moveCommandId = await weakHit();
    const ai = new StubProvider({ responses: [OPTIONS] });
    const commandId = newId<CommandId>();

    const result = await offer(ai, moveCommandId, commandId);

    if (!result.ok) throw new Error(result.message);
    expect(result.options).toHaveLength(3);
    expect(result.options[0]?.chips.map((c) => c.oracleId)).toEqual([
      'oracle:core/action',
      'oracle:core/theme',
    ]);
    const asked = ai.requests[0]!;
    expect(asked.purpose).toBe('complication_options');
    expect(asked.user).toContain(
      'The outcome calls for a complication: "but also complicates your quest"',
    );
    const events = await readEvents(db.sql, campaignId);
    const invoked = events.find((e) => e.commandId === moveCommandId && e.type === 'move.invoked')!;
    const written = events.filter((e) => e.commandId === commandId);
    expect(written.map((e) => e.type)).toEqual([
      ...Array<string>(6).fill('oracle.rolled'),
      'ai.completed',
      'complication.offered',
    ]);
    expect(written.every((e) => e.causedBy === invoked.id)).toBe(true);
  });

  it('refuses to narrate the beat until a complication is set, then narrates it as a fact grounded in its option', async () => {
    const moveCommandId = await weakHit();
    await expect(
      prepareBeatNarration(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: moveCommandId,
      }),
    ).rejects.toMatchObject({ reason: 'complication_required' });

    const offered = await offer(new StubProvider({ responses: [OPTIONS] }), moveCommandId);
    if (!offered.ok) throw new Error(offered.message);
    const set = await setComplication(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      moveCommandId,
      text: 'The station was abandoned, yet one life-support circuit is still drawing power.',
      offeredEventId: offered.eventId,
      optionIndex: 0,
    });
    expect(set.source).toBe('offered');

    const prepared = await prepareBeatNarration(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      afterCommandId: moveCommandId,
    });
    if (prepared.kind !== 'run') throw new Error('expected a run');
    const fact = prepared.segments.facts.find((f) =>
      f.text.startsWith('The player set the complication:'),
    );
    expect(fact?.grounds).toEqual(offered.options[0]!.chips.map((c) => c.eventId));
    // The offer's options and rolls are not what happened: only the set complication is.
    expect(prepared.segments.facts.some((f) => f.text.startsWith('Oracle result'))).toBe(false);
  });

  it('records an edited pick as written, still naming the offer', async () => {
    const moveCommandId = await weakHit();
    const offered = await offer(new StubProvider({ responses: [OPTIONS] }), moveCommandId);
    if (!offered.ok) throw new Error(offered.message);

    const set = await setComplication(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      moveCommandId,
      text: 'The logs were edited after the evacuation, by someone who knew the codes.',
      offeredEventId: offered.eventId,
      optionIndex: 1,
    });

    expect(set.source).toBe('written');
    const events = await readEvents(db.sql, campaignId);
    expect(events.find((e) => e.id === set.eventId)).toMatchObject({
      actor: { kind: 'player' },
      payload: { source: 'written', offeredEventId: offered.eventId, optionIndex: 1 },
    });
  });

  it('lets the player ask again, each set kept, and set one written from scratch', async () => {
    const moveCommandId = await weakHit();
    const first = await offer(new StubProvider({ responses: [OPTIONS] }), moveCommandId);
    const second = await offer(new StubProvider({ responses: [OPTIONS] }), moveCommandId);
    expect(first.ok && second.ok && first.eventId !== second.eventId).toBe(true);

    const set = await setComplication(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      moveCommandId,
      text: 'The docking port is still armed.',
    });
    expect(set.source).toBe('written');

    await expect(
      setComplication(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveCommandId,
        text: 'A second one.',
      }),
    ).rejects.toMatchObject({ reason: 'already_set' });
  });

  it('re-asks options that name a player character, then records the failure with its rolls', async () => {
    const moveCommandId = await weakHit();
    const naming: StubResponse = {
      kind: 'structured',
      value: {
        options: [
          { text: 'Juno trips an alarm.', cites: ['O1.action', 'O1.theme'] },
          { text: 'The logs were edited.', cites: ['O2.action', 'O2.theme'] },
          { text: 'Something listens back.', cites: ['O3.action', 'O3.theme'] },
        ],
      },
    };
    const ai = new StubProvider({ responses: [naming, naming] });
    const commandId = newId<CommandId>();

    const result = await offer(ai, moveCommandId, commandId);

    expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    expect(ai.requests[1]?.user).toMatch(/names Juno, a player character/);
    const written = (await readEvents(db.sql, campaignId)).filter((e) => e.commandId === commandId);
    expect(written.filter((e) => e.type === 'oracle.rolled')).toHaveLength(6);
    expect(written.at(-1)?.type).toBe('ai.failed');
  });

  it('refuses an outcome that calls for no complication, an unknown option, and a burn that lifted the tier', async () => {
    const strong = newId<CommandId>();
    await invokeMove(db.sql, {
      campaignId,
      commandId: strong,
      actor: PLAYER,
      moveId: 'move:adventure/gather-information',
      actorCharacterId: juno,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      rng: actionRoll(6, [3, 2]),
    });
    await expect(offer(new StubProvider(), strong)).rejects.toBeInstanceOf(AiRequestRefusedError);

    const moveCommandId = await weakHit();
    const offered = await offer(new StubProvider({ responses: [OPTIONS] }), moveCommandId);
    if (!offered.ok) throw new Error(offered.message);
    await expect(
      setComplication(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveCommandId,
        text: 'x',
        offeredEventId: offered.eventId,
        optionIndex: 7,
      }),
    ).rejects.toMatchObject({ reason: 'unknown_option' });

    // Vesna has momentum to burn: a weak hit burned to a strong hit owes no complication.
    const burnable = newId<CommandId>();
    const invoked = await invokeMove(db.sql, {
      campaignId,
      commandId: burnable,
      actor: PLAYER,
      moveId: 'move:adventure/gather-information',
      actorCharacterId: vesna,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      rng: actionRoll(2, [6, 3]),
    });
    if (invoked.roll.burnOffer === undefined || invoked.roll.tier !== 'weak_hit') {
      throw new Error('expected a burnable weak hit');
    }
    await burnMomentum(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      rollEventId: invoked.rollEventId,
    });
    await expect(offer(new StubProvider(), burnable)).rejects.toMatchObject({
      reason: 'no_complication',
    });
    const events = await readEvents(db.sql, campaignId);
    const scope = resolveBeatScope(events, burnable);
    if (!scope.ok) throw new Error(scope.detail);
    expect(describeBeat(scope.events, project(events), events).burned).toBe(true);
    await expect(
      prepareBeatNarration(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: burnable,
      }),
    ).resolves.toMatchObject({ kind: 'run' });
  });
});
