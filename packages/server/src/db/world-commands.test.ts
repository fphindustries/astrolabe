import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSeededRandomSource, type CharacterId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CommandId, type EventId } from '@astrolabe/shared';

import type { TextSink } from '../ai/respond.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import {
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';

import { readEvents } from './event-store.js';
import { invokeMove } from './move-commands.js';
import {
  AiRequestRefusedError,
  prepareBeatNarration,
  runBeatNarration,
} from './narration-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { voidEvent } from './void-command.js';
import { derivedUuid } from './uuid.js';
import {
  prepareSceneFrame,
  prepareWorldPass,
  runSceneFrame,
  runWorldPass,
} from './world-commands.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const campaignId = SESSION_TWO_OPEN_CAMPAIGN_ID;
const SINK: TextSink = { delta: () => {}, reset: () => {} };

const PASSAGE: StubResponse = {
  kind: 'structured',
  value: {
    segments: [
      {
        about: 'world',
        character: null,
        basis: [],
        text: 'The trace narrows to one lit compartment deep in the relay.',
      },
    ],
  },
};

const NOTHING: StubResponse = {
  kind: 'structured',
  value: { review: 'Nothing new.', recipes: [] },
};
const AN_NPC: StubResponse = {
  kind: 'structured',
  value: {
    review: 'The trace finds someone alive aboard, not yet established.',
    recipes: [{ recipe: 'npc', reason: 'The trace finds someone alive aboard.' }],
  },
};

function interpretation(overrides: { name?: string; role?: string } = {}): StubResponse {
  return {
    kind: 'structured',
    value: {
      entities: [
        {
          instance: 'E1',
          name: overrides.name ?? 'Sura Vance',
          nameCites: ['E1.given_name', 'E1.family_name'],
          fields: [
            { slot: 'role', text: overrides.role ?? 'Keeps the relay alive.', cites: ['E1.role'] },
            { slot: 'goal', text: 'Wants to be left alone.', cites: ['E1.goal'] },
            { slot: 'first_look', text: 'Gaunt, in a patched suit.', cites: ['E1.first_look'] },
            { slot: 'disposition', text: 'Wary of strangers.', cites: ['E1.disposition'] },
          ],
        },
      ],
    },
  };
}

describe.skipIf(!hasTestDatabase)('the world pass (task 8.1, D-137, D-138)', () => {
  let db: TestDatabase;
  let vesna: CharacterId;

  beforeAll(async () => {
    db = await createTestDatabase('world_pass');
    await seedFixture(db.sql, SESSION_TWO_OPEN);
    const state = project(await readEvents(db.sql, campaignId));
    vesna = Object.values(state.characters).find((c) => c.callsign === 'Vesna')!.id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Vesna's scan, strong hit, narrated: Beat 6's shape. */
  async function scanned(): Promise<{ moveCommandId: CommandId; passageEventId: EventId }> {
    const moveCommandId = newId<CommandId>();
    await invokeMove(db.sql, {
      campaignId,
      commandId: moveCommandId,
      actor: PLAYER,
      moveId: 'move:adventure/gather-information',
      actorCharacterId: vesna,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      actionText: "Vesna traces the power draw with the Lantern Wake's sensors.",
      rng: actionRoll(6, [3, 2]),
    });
    const prepared = await prepareBeatNarration(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      afterCommandId: moveCommandId,
    });
    if (prepared.kind !== 'run') throw new Error('expected a fresh narration');
    const result = await runBeatNarration(
      db.sql,
      new StubProvider({ responses: [PASSAGE] }),
      new StubProvider(),
      prepared,
      SINK,
    );
    if (!result.ok) throw new Error(result.message);
    return { moveCommandId, passageEventId: result.eventId };
  }

  async function pass(
    ai: StubProvider,
    passageEventId: EventId,
    commandId: CommandId = newId<CommandId>(),
    sink: TextSink = SINK,
  ) {
    const prepared = await prepareWorldPass(db.sql, {
      campaignId,
      commandId,
      actor: PLAYER,
      passageEventId,
      rng: createSeededRandomSource(6),
    });
    return prepared.kind === 'replay'
      ? prepared.result
      : runWorldPass(db.sql, ai, new StubProvider(), prepared, sink);
  }

  it('asks with the beat, its outcome text and its passage, offering only the npc recipe', async () => {
    const { passageEventId } = await scanned();
    const ai = new StubProvider({ responses: [NOTHING] });

    await pass(ai, passageEventId);

    const asked = ai.requests[0]!;
    expect(asked.purpose).toBe('world_plan');
    expect(asked.user).toContain('<resolved_beat>');
    expect(asked.user).toContain(
      'Gather Information: On a strong hit, you discover something helpful',
    );
    expect(asked.user).toContain('The trace narrows to one lit compartment deep in the relay.');
    expect(asked.user).toContain('- npc: a non-player character');
    expect(asked.user).not.toContain('- derelict:');
  });

  it('writes only the plan’s accounting when the beat brings nothing new, caused by the passage', async () => {
    const { passageEventId } = await scanned();
    const commandId = newId<CommandId>();

    const result = await pass(
      new StubProvider({ responses: [NOTHING] }),
      passageEventId,
      commandId,
    );

    expect(result.ok).toBe(true);
    const written = (await readEvents(db.sql, campaignId)).filter((e) => e.commandId === commandId);
    expect(written.map((e) => e.type)).toEqual(['ai.completed']);
    expect(written.every((e) => e.causedBy === passageEventId)).toBe(true);
  });

  it('rolls the recipe, then establishes the entity from its interpretation, citing every roll', async () => {
    const { passageEventId } = await scanned();
    const ai = new StubProvider({ responses: [AN_NPC, interpretation()] });
    const commandId = newId<CommandId>();

    const result = await pass(ai, passageEventId, commandId);

    expect(result.ok).toBe(true);
    const events = await readEvents(db.sql, campaignId);
    const written = events.filter((e) => e.commandId === commandId);
    expect(written.map((e) => e.type)).toEqual([
      'ai.completed',
      ...Array<string>(6).fill('oracle.rolled'),
      'ai.completed',
      'entity.established',
    ]);

    const rolls = written.filter((e) => e.type === 'oracle.rolled');
    expect(rolls.map((e) => e.type === 'oracle.rolled' && e.payload.slot)).toEqual([
      'role',
      'goal',
      'first_look',
      'disposition',
      'given_name',
      'family_name',
    ]);
    expect(rolls.every((e) => e.actor.kind === 'system')).toBe(true);
    expect(
      rolls.every((e) => e.type === 'oracle.rolled' && e.payload.recipeId === 'recipe:npc'),
    ).toBe(true);

    const interpretAsked = ai.requests[1]!;
    expect(interpretAsked.purpose).toBe('world_interpret');
    for (const roll of rolls) {
      if (roll.type === 'oracle.rolled') {
        expect(interpretAsked.user).toContain(roll.payload.rowText);
      }
    }

    const entity = written.find((e) => e.type === 'entity.established');
    expect(entity?.actor.kind).toBe('ai');
    const projected = project(events).entities;
    const npc = Object.values(projected).find((e) => e.name === 'Sura Vance');
    expect(npc).toMatchObject({
      kind: 'npc',
      fields: {
        role: 'Keeps the relay alive.',
        goal: 'Wants to be left alone.',
        first_look: 'Gaunt, in a patched suit.',
        disposition: 'Wary of strangers.',
      },
      provenance: {
        establishedBy: 'ai',
        recipeId: 'recipe:npc',
        groundedIn: rolls.map((e) => e.id),
      },
    });
  });

  it('replays by command id, and refuses a second pass after the same passage', async () => {
    const { passageEventId } = await scanned();
    const commandId = newId<CommandId>();
    const ai = new StubProvider({ responses: [NOTHING] });

    const first = await pass(ai, passageEventId, commandId);
    const again = await pass(ai, passageEventId, commandId);

    expect(again).toEqual(first);
    expect(ai.requests).toHaveLength(1);
    await expect(pass(ai, passageEventId)).rejects.toMatchObject({ reason: 'already_passed' });
  });

  it('re-asks an interpretation that names a player character, then records the failure with its rolls', async () => {
    const { passageEventId } = await scanned();
    const naming = interpretation({ role: 'Found by Vesna in the lower core.' });
    const ai = new StubProvider({ responses: [AN_NPC, naming, naming] });
    const commandId = newId<CommandId>();

    const result = await pass(ai, passageEventId, commandId);

    expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    expect(ai.requests[2]?.user).toMatch(/names Vesna, a player character/);
    const written = (await readEvents(db.sql, campaignId)).filter((e) => e.commandId === commandId);
    expect(written.filter((e) => e.type === 'oracle.rolled')).toHaveLength(6);
    expect(written.some((e) => e.type === 'entity.established')).toBe(false);
    expect(written.at(-1)?.type).toBe('ai.failed');

    // A failed pass may be retried.
    const retried = await pass(
      new StubProvider({ responses: [AN_NPC, interpretation()] }),
      passageEventId,
    );
    expect(retried.ok).toBe(true);
  });

  it('refuses an event that is not a beat passage, and a voided passage', async () => {
    const { moveCommandId, passageEventId } = await scanned();
    const move = (await readEvents(db.sql, campaignId)).find(
      (e) => e.commandId === moveCommandId && e.type === 'move.invoked',
    )!;

    await expect(pass(new StubProvider(), move.id)).rejects.toBeInstanceOf(AiRequestRefusedError);

    await voidEvent(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      targetEventId: move.id,
      reason: 'Wrong move',
    });
    await expect(pass(new StubProvider(), passageEventId)).rejects.toMatchObject({
      reason: 'voided',
    });
  });

  it('is voided with the move it followed (D-83)', async () => {
    const { moveCommandId, passageEventId } = await scanned();
    const commandId = newId<CommandId>();
    await pass(
      new StubProvider({ responses: [AN_NPC, interpretation({ name: 'Ilse Varn' })] }),
      passageEventId,
      commandId,
    );
    const move = (await readEvents(db.sql, campaignId)).find(
      (e) => e.commandId === moveCommandId && e.type === 'move.invoked',
    )!;

    await voidEvent(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      targetEventId: move.id,
      reason: 'Wrong move',
    });

    const events = await readEvents(db.sql, campaignId);
    const voids = computeVoidState(events);
    const entity = events.find(
      (e) => e.commandId === commandId && e.type === 'entity.established',
    )!;
    expect(isSuppressed(entity, voids)).toBe(true);
    expect(Object.values(project(events).entities).some((e) => e.name === 'Ilse Varn')).toBe(false);
  });

  /** A passage that narrates everything it is given, citing it. */
  const WORLD_PASSAGE: StubResponse = {
    kind: 'structured',
    value: {
      segments: [
        {
          about: 'world',
          character: null,
          basis: ['F1'],
          text: 'A thin voice crackles over the open channel, asking who is out there.',
        },
      ],
    },
  };

  it('narrates what it established in a follow-up passage, grounded in the rolls (8.2)', async () => {
    const { passageEventId } = await scanned();
    const commandId = newId<CommandId>();
    const frames: string[] = [];
    const ai = new StubProvider({
      responses: [AN_NPC, interpretation({ name: 'Mara Quell' }), WORLD_PASSAGE],
    });

    const result = await pass(ai, passageEventId, commandId, {
      ...SINK,
      world: () => frames.push('world'),
      delta: () => {
        if (!frames.includes('delta')) frames.push('delta');
      },
    });

    expect(result.ok).toBe(true);
    expect(frames).toEqual(['world', 'delta']);
    const events = await readEvents(db.sql, campaignId);
    const entity = events.find((e) => e.commandId === commandId && e.type === 'entity.established');
    if (entity?.type !== 'entity.established') throw new Error('expected an entity');
    const passage = events.find(
      (e) =>
        e.commandId === derivedUuid(commandId, 'world-passage') && e.type === 'narration.written',
    );
    expect(passage).toMatchObject({
      causedBy: entity.id,
      payload: { role: 'world', groundedIn: entity.payload.provenance.groundedIn },
    });
    expect(ai.requests[2]?.purpose).toBe('world_passage');
    expect(ai.requests[2]?.user).toContain('non-player character named Mara Quell');
    expect(ai.requests[2]?.user).toContain('Every segment in this passage is world.');
  });

  it('resumes at the passage when only the passage failed, without rolling again', async () => {
    const { passageEventId } = await scanned();
    const failing = new StubProvider({
      responses: [
        AN_NPC,
        interpretation({ name: 'Oren Pike' }),
        { kind: 'error', errorKind: 'unavailable' },
      ],
    });
    const first = await pass(failing, passageEventId);
    expect(first).toMatchObject({ ok: false, errorKind: 'unavailable' });

    const retry = new StubProvider({ responses: [WORLD_PASSAGE] });
    const retried = await pass(retry, passageEventId);

    expect(retried.ok).toBe(true);
    expect(retry.requests.map((r) => r.purpose)).toEqual(['world_passage']);
    const events = await readEvents(db.sql, campaignId);
    expect(
      Object.values(project(events).entities).filter((e) => e.name === 'Oren Pike'),
    ).toHaveLength(1);
    await expect(pass(new StubProvider(), passageEventId)).rejects.toMatchObject({
      reason: 'already_passed',
    });
  });

  it('refuses a world pass after a follow-up passage, which is not a beat', async () => {
    const { passageEventId } = await scanned();
    const result = await pass(
      new StubProvider({
        responses: [AN_NPC, interpretation({ name: 'Tam Ruiz' }), WORLD_PASSAGE],
      }),
      passageEventId,
    );
    if (!result.ok) throw new Error(result.message);
    await expect(pass(new StubProvider(), result.eventId)).rejects.toMatchObject({
      reason: 'not_a_passage',
    });
  });

  describe('the scene frame (D-141)', () => {
    const DERELICT: StubResponse = {
      kind: 'structured',
      value: {
        review: 'Varga Relay is a derelict whose condition is not established.',
        recipes: [{ recipe: 'derelict', reason: 'The relay is a derelict.' }],
      },
    };
    const FRAME: StubResponse = {
      kind: 'structured',
      value: {
        segments: [
          {
            about: 'world',
            character: null,
            basis: ['F1'],
            text: 'Varga Relay hangs dark against the ice.',
          },
          {
            about: 'world',
            character: null,
            basis: ['F2', 'F3'],
            text: 'Its ring is breached, and one row of windows burns.',
          },
        ],
      },
    };

    it('rolls the derelict recipe, frames the scene world-only, and grounds it in the rolls it cites', async () => {
      const db2 = await createTestDatabase('scene_frame');
      try {
        await seedFixture(db2.sql, SESSION_TWO_OPEN);
        const ai = new StubProvider({ responses: [DERELICT, FRAME] });
        const commandId = newId<CommandId>();
        const prepared = await prepareSceneFrame(db2.sql, {
          campaignId,
          commandId,
          actor: PLAYER,
          rng: createSeededRandomSource(2),
        });
        if (prepared.kind !== 'run') throw new Error('expected a run');

        const result = await runSceneFrame(db2.sql, ai, new StubProvider(), prepared, SINK);

        expect(result.ok).toBe(true);
        expect(ai.requests.map((r) => r.purpose)).toEqual(['scene_frame_plan', 'scene_frame']);
        expect(ai.requests[1]?.user).toMatch(/Write 120 to 200 words/);
        const events = await readEvents(db2.sql, campaignId);
        const written = events.filter((e) => e.commandId === commandId);
        const rolls = written.filter((e) => e.type === 'oracle.rolled');
        expect(rolls.map((e) => e.type === 'oracle.rolled' && e.payload.slot)).toEqual([
          'condition',
          'outer_first_look',
          'inner_first_look',
        ]);
        const frame = written.find((e) => e.type === 'narration.written');
        expect(frame).toMatchObject({
          payload: { role: 'scene_frame', groundedIn: [rolls[0]!.id, rolls[1]!.id] },
        });
        expect(project(events).scene?.framedBy).toBe(frame?.id);

        await expect(
          prepareSceneFrame(db2.sql, { campaignId, commandId: newId(), actor: PLAYER }),
        ).rejects.toMatchObject({ reason: 'already_framed' });
      } finally {
        await db2.close();
      }
    });

    it('withdraws a frame segment about a player character, and re-asks', async () => {
      const db2 = await createTestDatabase('scene_frame_world_only');
      try {
        await seedFixture(db2.sql, SESSION_TWO_OPEN);
        const aboutVesna: StubResponse = {
          kind: 'structured',
          value: {
            segments: [
              {
                about: 'character_undergoes',
                character: 'Vesna',
                basis: ['F1'],
                text: 'The cold reaches the cockpit.',
              },
            ],
          },
        };
        const ai = new StubProvider({
          responses: [
            { kind: 'structured', value: { review: 'Nothing to roll.', recipes: [] } },
            aboutVesna,
            FRAME_WITHOUT_ROLLS,
          ],
        });
        const prepared = await prepareSceneFrame(db2.sql, {
          campaignId,
          commandId: newId(),
          actor: PLAYER,
        });
        if (prepared.kind !== 'run') throw new Error('expected a run');

        const result = await runSceneFrame(db2.sql, ai, new StubProvider(), prepared, SINK);

        expect(result.ok).toBe(true);
        expect(ai.requests[2]?.user).toMatch(/narrates the world only/);
      } finally {
        await db2.close();
      }
    });

    const FRAME_WITHOUT_ROLLS: StubResponse = {
      kind: 'structured',
      value: {
        segments: [
          {
            about: 'world',
            character: null,
            basis: ['F1'],
            text: 'Varga Relay hangs dark against the ice.',
          },
        ],
      },
    };
  });
});
