import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JUNO, SESSION_ID, VOW_TRACK } from '@astrolabe/shared/test-fixtures';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';

import {
  AmendRefusedError,
  overrideState,
  requestNarrationCorrection,
  reviseNarration,
} from './amend-commands.js';
import { appendCommand, readEvents, readNarrativeEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { voidEvent } from './void-command.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const AI: Actor = { kind: 'ai' };
const newId = <T>(): T => uuidv7() as T;

describe.skipIf(!hasTestDatabase)('amendments (A15, A16, Beat 9)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('amend');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Juno at +3 momentum, a vow, and one passage of narration to correct. */
  async function beatNine() {
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'campaign.create',
      actor: PLAYER,
      createCampaign: { name: 'Lantern Wake' },
      events: [
        {
          type: 'campaign.created',
          payload: {
            name: 'Lantern Wake',
            settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
          },
        },
        {
          type: 'character.created',
          payload: {
            characterId: JUNO,
            name: 'Juno Marr',
            callsign: 'Juno',
            stats: { edge: 1, heart: 2, iron: 1, shadow: 2, wits: 3 },
            meters: {
              health: { value: 5, min: 0, max: 5 },
              spirit: { value: 5, min: 0, max: 5 },
              supply: { value: 5, min: 0, max: 5 },
            },
            momentum: 3,
            assets: [],
          },
        },
      ],
    });

    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'session.begin',
      actor: PLAYER,
      events: [
        { type: 'session.began', payload: { sessionId: SESSION_ID, number: 2 } },
        {
          type: 'track.created',
          payload: {
            kind: 'vow',
            trackId: VOW_TRACK,
            title: "Recover the flight recorder of Meridian's Hope",
            rank: 'formidable',
          },
          sessionId: SESSION_ID,
        },
      ],
    });

    const narrated = await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'narrate',
      actor: AI,
      events: [
        {
          type: 'narration.written',
          payload: { role: 'beat', text: 'Rook looks shaken.', groundedIn: [] },
          sessionId: SESSION_ID,
        },
      ],
    });

    return { campaignId, passageId: narrated.events[0]?.id };
  }

  describe('manual override (A16)', () => {
    it('sets the value and records who changed it and why', async () => {
      const { campaignId } = await beatNine();
      await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'momentum', characterId: JUNO },
        to: 4,
        reason: 'a ruling from last session left this one too low',
      });

      const momentum = project(await readEvents(db.sql, campaignId)).characters[JUNO]?.momentum;
      expect(momentum?.value).toBe(4);
      // A16: visually distinct from an automated change.
      expect(momentum?.lastChangedBy.actorKind).toBe('player');
      expect(momentum?.lastChangedBy.reason).toMatch(/ruling from last session/);
    });

    it('reads `from` off the projection rather than trusting the caller', async () => {
      const { campaignId } = await beatNine();
      const result = await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'momentum', characterId: JUNO },
        to: 4,
      });

      const event = result.events[0];
      if (event?.type !== 'state.overridden') throw new Error('expected an override');
      expect(event.payload.from).toBe(3);
    });

    it('is distinguishable from an automated change to the same field', async () => {
      const { campaignId } = await beatNine();
      await appendCommand(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        kind: 'move',
        actor: PLAYER,
        events: [
          {
            type: 'state.changed',
            payload: {
              cause: {
                kind: 'move_outcome',
                moveId: 'move:adventure/gather_information',
                tier: 'weak_hit',
              },
              changes: [
                { delta: { kind: 'momentum', characterId: JUNO, delta: 1 }, clause: '+1 momentum' },
              ],
            },
            sessionId: SESSION_ID,
            actor: { kind: 'system' },
          },
        ],
      });

      const automated = project(await readEvents(db.sql, campaignId)).characters[JUNO]?.momentum;
      expect(automated?.value).toBe(4);
      expect(automated?.lastChangedBy.actorKind).toBe('system');

      await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'momentum', characterId: JUNO },
        to: 6,
      });
      const manual = project(await readEvents(db.sql, campaignId)).characters[JUNO]?.momentum;
      expect(manual?.value).toBe(6);
      expect(manual?.lastChangedBy.actorKind).toBe('player');
    });

    it('overrides a meter and a track as well as momentum (D-26)', async () => {
      const { campaignId } = await beatNine();
      await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'meter', characterId: JUNO, meter: 'health' },
        to: 2,
      });
      await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'track', trackId: VOW_TRACK },
        to: 12,
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.characters[JUNO]?.meters.health.value).toBe(2);
      expect(state.tracks[VOW_TRACK]?.ticks).toBe(12);
    });

    it('refuses a value outside the field bounds, and writes nothing', async () => {
      const { campaignId } = await beatNine();
      const before = await readEvents(db.sql, campaignId);

      await expect(
        overrideState(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          target: { kind: 'meter', characterId: JUNO, meter: 'health' },
          to: 99,
        }),
      ).rejects.toThrow(/between 0 and 5/);

      expect(await readEvents(db.sql, campaignId)).toHaveLength(before.length);
    });

    it('allows momentum down to the fixed floor of -6 (D-78)', async () => {
      const { campaignId } = await beatNine();
      await overrideState(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        target: { kind: 'momentum', characterId: JUNO },
        to: -6,
      });
      expect(project(await readEvents(db.sql, campaignId)).characters[JUNO]?.momentum.value).toBe(
        -6,
      );

      await expect(
        overrideState(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          target: { kind: 'momentum', characterId: JUNO },
          to: -7,
        }),
      ).rejects.toThrow(/between -6 and 10/);
    });

    it('refuses a target that does not exist', async () => {
      const { campaignId } = await beatNine();
      await expect(
        overrideState(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          target: { kind: 'momentum', characterId: newId() },
          to: 4,
        }),
      ).rejects.toThrow(AmendRefusedError);
    });

    it('refuses an override that is not the player (section 3)', async () => {
      const { campaignId } = await beatNine();
      await expect(
        overrideState(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: AI,
          target: { kind: 'momentum', characterId: JUNO },
          to: 4,
        }),
      ).rejects.toThrow(/Only a player/);
    });
  });

  describe('narration correction (A15, D-73)', () => {
    async function correct(campaignId: CampaignId, passageId: string) {
      const requested = await requestNarrationCorrection(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: passageId as never,
        note: 'Rook is a veteran — annoyed, not rattled.',
      });
      return reviseNarration(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: AI,
        targetEventId: passageId as never,
        text: 'Rook shakes the sparks off his sleeve, annoyed.',
        causedBy: requested.events[0]?.id as never,
      });
    }

    it('reads as the revision, with the original and the note retained', async () => {
      const { campaignId, passageId } = await beatNine();
      await correct(campaignId, passageId as string);

      const page = buildNarrativeLog(
        await readNarrativeEvents(db.sql, campaignId, { sessionId: SESSION_ID }),
      );
      const entry = page.beats.flatMap((b) => b.entries).find((e) => e.event.id === passageId);

      expect(entry?.narration?.text).toBe('Rook shakes the sparks off his sleeve, annoyed.');
      expect(entry?.narration?.original).toBe('Rook looks shaken.');
      expect(entry?.narration?.note).toMatch(/veteran/);
    });

    it('changes nothing mechanical', async () => {
      const { campaignId, passageId } = await beatNine();
      const before = project(await readEvents(db.sql, campaignId));
      await correct(campaignId, passageId as string);
      const after = project(await readEvents(db.sql, campaignId));

      expect(after.characters).toEqual(before.characters);
      expect(after.tracks).toEqual(before.tracks);
      expect(after.entities).toEqual(before.entities);
    });

    it('keeps both events in the log', async () => {
      const { campaignId, passageId } = await beatNine();
      await correct(campaignId, passageId as string);

      const types = (await readEvents(db.sql, campaignId)).map((e) => e.type);
      expect(types).toContain('narration.written');
      expect(types).toContain('narration.correction_requested');
      expect(types).toContain('narration.revised');
    });

    it('links the rewrite to the request, so voiding the request removes it', async () => {
      const { campaignId, passageId } = await beatNine();
      const requested = await requestNarrationCorrection(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: passageId as never,
        note: 'Wrong.',
      });
      await reviseNarration(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: AI,
        targetEventId: passageId as never,
        text: 'A rewrite nobody should keep.',
        causedBy: requested.events[0]?.id as never,
      });

      await voidEvent(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: requested.events[0]?.id as never,
        reason: 'I was wrong to flag it',
      });

      const page = buildNarrativeLog(
        await readNarrativeEvents(db.sql, campaignId, { sessionId: SESSION_ID }),
      );
      const entry = page.beats.flatMap((b) => b.entries).find((e) => e.event.id === passageId);
      // The rewrite went with the request that asked for it.
      expect(entry?.narration?.text).toBe('Rook looks shaken.');
      expect(entry?.narration?.corrected).toBe(false);
    });

    it('refuses to correct something that is not a passage', async () => {
      const { campaignId } = await beatNine();
      const events = await readEvents(db.sql, campaignId);
      const notNarration = events.find((e) => e.type === 'session.began');

      await expect(
        requestNarrationCorrection(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          targetEventId: notNarration?.id as never,
          note: 'x',
        }),
      ).rejects.toThrow(/not a narration passage/);
    });

    it('refuses to correct a voided passage', async () => {
      const { campaignId, passageId } = await beatNine();
      await voidEvent(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: passageId as never,
        reason: 'that beat did not happen',
      });

      await expect(
        requestNarrationCorrection(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          targetEventId: passageId as never,
          note: 'x',
        }),
      ).rejects.toThrow(/has been voided/);
    });

    it('refuses a flag that is not from the player', async () => {
      const { campaignId, passageId } = await beatNine();
      await expect(
        requestNarrationCorrection(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: AI,
          targetEventId: passageId as never,
          note: 'x',
        }),
      ).rejects.toThrow(/Only a player/);
    });
  });
});
