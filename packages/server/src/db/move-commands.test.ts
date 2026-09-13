import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSeededRandomSource, type CharacterDraft, type CharacterId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { createCharacter } from './character-commands.js';
import {
  applyMoveChoice,
  burnMomentum,
  invokeMove,
  MoveRejectedError,
  resolvePayThePriceMethod,
} from './move-commands.js';
import { appendCommand, readEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { previewVoid, voidEvent } from './void-command.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const SYSTEM: Actor = { kind: 'system' };
const newId = <T>(): T => uuidv7() as T;

function draft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    name: 'Rook Ilari',
    callsign: 'Rook',
    stats: { edge: 1, heart: 2, iron: 2, shadow: 1, wits: 3 },
    assets: [],
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('resolving a move (task 6.x)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('moves');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function newCampaign(): Promise<CampaignId> {
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
      ],
    });
    return campaignId;
  }

  async function newCharacter(
    campaignId: CampaignId,
    overrides: Partial<CharacterDraft> = {},
  ): Promise<CharacterId> {
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(overrides),
    });
    return characterId;
  }

  /** Test-only shortcut past the normal write paths, mirroring golden-beats.ts's own use of appendCommand directly for setup. */
  async function grantMomentum(
    campaignId: CampaignId,
    characterId: CharacterId,
    delta: number,
  ): Promise<void> {
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'test.grant_momentum',
      actor: SYSTEM,
      events: [
        {
          type: 'state.changed',
          payload: {
            cause: { kind: 'ai_judgement', reason: 'test setup' },
            changes: [{ delta: { kind: 'momentum', characterId, delta } }],
          },
        },
      ],
    });
  }

  async function beginSession(campaignId: CampaignId): Promise<void> {
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'session.begin',
      actor: PLAYER,
      events: [{ type: 'session.began', payload: { sessionId: newId(), number: 1 } }],
    });
  }

  async function markWounded(campaignId: CampaignId, characterId: CharacterId): Promise<void> {
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'test.mark_wounded',
      actor: SYSTEM,
      events: [
        {
          type: 'state.changed',
          payload: {
            cause: { kind: 'ai_judgement', reason: 'test setup' },
            changes: [
              {
                delta: { kind: 'impact', characterId, impact: 'impact:wounded', set: true },
              },
            ],
          },
        },
      ],
    });
  }

  describe('invokeMove', () => {
    it('rolls a strong hit and applies its unconditional effects in the same command', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        actionText: 'Rook forces the sealed bulkhead.',
        rng: createSeededRandomSource(2),
      });

      expect(invoked.pendingChoice).toBeUndefined();
      expect(invoked.chain).toBeUndefined();

      const events = await readEvents(db.sql, campaignId);
      const roll = events.find((e) => e.id === invoked.rollEventId);
      expect(roll?.type).toBe('dice.rolled');
      if (roll?.type === 'dice.rolled' && roll.payload.kind === 'action') {
        expect(roll.payload.tier).toBe('strong_hit');
        // The base add came from the character's own stat, not a client value.
        expect(roll.payload.adds).toEqual([{ amount: 2, label: 'iron' }]);
      }

      const state = project(events);
      expect(state.characters[characterId]?.momentum.value).toBe(3); // 2 starting + 1
    });

    it('offers a chain to Pay the Price on a miss, without applying any effect', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(8),
      });

      expect(invoked.chain).toEqual({
        toMoveId: 'move:fate/pay-the-price',
        mode: 'offer',
        reason: 'Face Danger, miss',
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.characters[characterId]?.momentum.value).toBe(2); // unchanged
    });

    it("redirects a hit's benefits to the aided ally (D-62, Beat 5)", async () => {
      const campaignId = await newCampaign();
      const rook = await newCharacter(campaignId, { callsign: 'Rook' });
      const vesna = await newCharacter(campaignId, { callsign: 'Vesna' });

      await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/secure-an-advantage',
        actorCharacterId: rook,
        aidingAllyId: vesna,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(2), // strong hit, same dice as face-danger's own seed 2
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.characters[rook]?.momentum.value).toBe(2); // unchanged
      expect(state.characters[vesna]?.momentum.value).toBe(4); // 2 starting + 2
      expect(state.characters[vesna]?.bonusNextMove?.amount).toBe(1);
    });

    it('rejects a move with no Milestone 1 automation', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      await expect(
        invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:adventure/undertake-an-expedition',
          actorCharacterId: characterId,
          adds: [],
        }),
      ).rejects.toThrow(MoveRejectedError);
    });

    it('rejects a no_roll move — it must go through resolvePayThePriceMethod instead', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      await expect(
        invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:fate/pay-the-price',
          actorCharacterId: characterId,
          adds: [],
        }),
      ).rejects.toThrow(/no_roll/);
    });

    it('rejects an actor that does not exist in the campaign', async () => {
      const campaignId = await newCampaign();
      await expect(
        invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:adventure/face-danger',
          actorCharacterId: newId<CharacterId>(),
          adds: [],
        }),
      ).rejects.toThrow(MoveRejectedError);
    });

    describe("Endure Harm's preRoll amount (A13, D-16)", () => {
      it('requires a committed amount within the declared range', async () => {
        const campaignId = await newCampaign();
        const characterId = await newCharacter(campaignId);

        await expect(
          invokeMove(db.sql, {
            campaignId,
            commandId: newId<CommandId>(),
            actor: PLAYER,
            moveId: 'move:suffer/endure-harm',
            actorCharacterId: characterId,
            adds: [],
            rng: createSeededRandomSource(1),
          }),
        ).rejects.toThrow(/committed amount/);

        await expect(
          invokeMove(db.sql, {
            campaignId,
            commandId: newId<CommandId>(),
            actor: PLAYER,
            moveId: 'move:suffer/endure-harm',
            actorCharacterId: characterId,
            adds: [],
            preRollAmount: -5,
            rng: createSeededRandomSource(1),
          }),
        ).rejects.toThrow(/between -3 and -1/);
      });

      it('commits the amount and applies it before the roll, in one command', async () => {
        const campaignId = await newCampaign();
        const characterId = await newCharacter(campaignId);

        const invoked = await invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:suffer/endure-harm',
          actorCharacterId: characterId,
          adds: [],
          preRollAmount: -1,
          rng: createSeededRandomSource(1),
        });

        const events = await readEvents(db.sql, campaignId);
        const committed = events.find((e) => e.type === 'amount.committed');
        expect(committed?.payload).toMatchObject({ amount: -1, meter: 'health', characterId });
        const roll = events.find((e) => e.id === invoked.rollEventId);
        expect(committed?.commandId).toBe(roll?.commandId);

        const state = project(events);
        expect(state.characters[characterId]?.meters.health.value).toBe(4); // 5 - 1
      });

      it("rolls +health against what is left after the harm, not the pre-harm value", async () => {
        const campaignId = await newCampaign();
        const characterId = await newCharacter(campaignId);

        const invoked = await invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:suffer/endure-harm',
          actorCharacterId: characterId,
          using: { using: 'condition_meter', meter: 'health' },
          adds: [],
          preRollAmount: -2,
          rng: createSeededRandomSource(1),
        });

        const events = await readEvents(db.sql, campaignId);
        const roll = events.find((e) => e.id === invoked.rollEventId);
        if (roll?.type === 'dice.rolled' && roll.payload.kind === 'action') {
          // 5 starting health, -2 from the harm just suffered: roll +3, not +5.
          expect(roll.payload.adds).toEqual([{ amount: 3, label: 'health' }]);
        } else {
          throw new Error('expected an action roll');
        }
      });
    });

    describe('a pending choice (task 6.6)', () => {
      it('surfaces both options as available when no guard applies', async () => {
        const campaignId = await newCampaign();
        const characterId = await newCharacter(campaignId);

        const invoked = await invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:adventure/secure-an-advantage',
          actorCharacterId: characterId,
          using: { using: 'stat', stat: 'iron' },
          adds: [],
          rng: createSeededRandomSource(21), // weak hit
        });

        expect(invoked.pendingChoice?.choiceId).toBe('saa-weak');
        expect(invoked.pendingChoice?.options.map((o) => o.available)).toEqual([true, true]);

        // No state.changed for the outcome yet — the player has not picked.
        const state = project(await readEvents(db.sql, campaignId));
        expect(state.characters[characterId]?.momentum.value).toBe(2);
      });

      it('marks an option unavailable when its guard fails (Endure Harm, wounded)', async () => {
        const campaignId = await newCampaign();
        const characterId = await newCharacter(campaignId);
        await markWounded(campaignId, characterId);

        const invoked = await invokeMove(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          moveId: 'move:suffer/endure-harm',
          actorCharacterId: characterId,
          adds: [],
          preRollAmount: -1,
          rng: createSeededRandomSource(1), // weak hit
        });

        const guarded = invoked.pendingChoice?.options.find(
          (o) => o.id === 'lose-momentum-for-health',
        );
        expect(guarded?.available).toBe(false);
      });
    });
  });

  describe('applyMoveChoice', () => {
    it("applies the picked option's effects, caused by the roll", async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/secure-an-advantage',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(21), // weak hit
      });
      const choiceId = invoked.pendingChoice?.choiceId;
      expect(choiceId).toBe('saa-weak');

      const { result } = await applyMoveChoice(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        rollEventId: invoked.rollEventId,
        choiceId: choiceId as string,
        optionIds: ['momentum'],
      });

      expect(result.events.some((e) => e.causedBy === invoked.rollEventId)).toBe(true);
      const state = project(await readEvents(db.sql, campaignId));
      expect(state.characters[characterId]?.momentum.value).toBe(4); // 2 + 2
    });

    it('rejects an option guarded unavailable', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);
      await markWounded(campaignId, characterId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:suffer/endure-harm',
        actorCharacterId: characterId,
        adds: [],
        preRollAmount: -1,
        rng: createSeededRandomSource(1), // weak hit
      });

      await expect(
        applyMoveChoice(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          rollEventId: invoked.rollEventId,
          choiceId: 'eh-weak',
          optionIds: ['lose-momentum-for-health'],
        }),
      ).rejects.toThrow(/not available/);
    });

    it('rejects a pick count outside the choice’s min/max', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/secure-an-advantage',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(21), // weak hit, pick exactly 1
      });

      await expect(
        applyMoveChoice(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          rollEventId: invoked.rollEventId,
          choiceId: 'saa-weak',
          optionIds: [],
        }),
      ).rejects.toThrow(/needs between/);
    });
  });

  describe('burnMomentum', () => {
    it('upgrades the tier and resets momentum (A8, Beat 5)', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);
      await grantMomentum(campaignId, characterId, 5); // 2 -> 7

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(1), // weak hit, burns to strong hit at momentum 7
      });
      expect(invoked.pendingChoice).toBeUndefined();

      const events = await readEvents(db.sql, campaignId);
      const roll = events.find((e) => e.id === invoked.rollEventId);
      const burnOffer =
        roll?.type === 'dice.rolled' && roll.payload.kind === 'action'
          ? roll.payload.burnOffer
          : undefined;
      expect(burnOffer?.wouldBecome).toBe('strong_hit');

      const { tierAfter } = await burnMomentum(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        rollEventId: invoked.rollEventId,
      });
      expect(tierAfter).toBe('strong_hit');

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.characters[characterId]?.momentum.value).toBe(2); // resetValue, 0 marked impacts
    });

    it('rejects a roll with no burn offer', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(2), // strong hit already, no offer at momentum 2
      });

      await expect(
        burnMomentum(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          rollEventId: invoked.rollEventId,
        }),
      ).rejects.toThrow(MoveRejectedError);
    });
  });

  describe('resolvePayThePriceMethod', () => {
    it('rolls the table and chains to Endure Harm on a matching result (D-08, Beat 7)', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const resolved = await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        actorCharacterId: characterId,
        optionId: 'table',
        rng: createSeededRandomSource(20),
      });

      expect(resolved.oracle).toEqual({ roll: 76, rowText: 'You are harmed' });
      expect(resolved.chain).toEqual({
        toMoveId: 'move:suffer/endure-harm',
        mode: 'auto',
        reason: 'Pay the Price, table result',
      });

      const events = await readEvents(db.sql, campaignId);
      expect(events.some((e) => e.type === 'oracle.rolled')).toBe(true);
      expect(events.some((e) => e.type === 'move.method_chosen')).toBe(true);
    });

    it('rolls the table with no automated chain when the row has none (D-67)', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const resolved = await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        actorCharacterId: characterId,
        optionId: 'table',
        rng: createSeededRandomSource(2),
      });

      expect(resolved.oracle?.rowText).toBe('You waste resources');
      expect(resolved.chain).toBeUndefined();
    });

    it('resolves the obvious method with no oracle roll at all', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const resolved = await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        actorCharacterId: characterId,
        optionId: 'obvious',
      });

      expect(resolved.oracle).toBeUndefined();
      expect(resolved.chain).toBeUndefined();
    });

    it('follows an offered chain from an earlier miss, and rejects a forged one', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);

      const faceDangerCommandId = newId<CommandId>();
      const invoked = await invokeMove(db.sql, {
        campaignId,
        commandId: faceDangerCommandId,
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(8), // miss, offers Pay the Price
      });
      expect(invoked.chain?.toMoveId).toBe('move:fate/pay-the-price');

      const resolved = await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        actorCharacterId: characterId,
        optionId: 'obvious',
        chainedFromCommandId: faceDangerCommandId,
      });

      const events = await readEvents(db.sql, campaignId);
      const invocation = events.find((e) => e.id === resolved.invocationEventId);
      const chainedEvent = events.find(
        (e) => e.type === 'move.chained' && e.commandId === faceDangerCommandId,
      );
      expect(chainedEvent).toBeDefined();
      expect(invocation?.causedBy).toBe(chainedEvent?.id);

      await expect(
        resolvePayThePriceMethod(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          actorCharacterId: characterId,
          optionId: 'obvious',
          chainedFromCommandId: newId<CommandId>(), // never offered anything
        }),
      ).rejects.toThrow(MoveRejectedError);
    });
  });

  describe('voiding across a chain (A11, A12, Beat 7)', () => {
    it('cascades a voided miss through the chain it started, three commands deep', async () => {
      const campaignId = await newCampaign();
      const characterId = await newCharacter(campaignId);
      await beginSession(campaignId); // D-84: void reaches only the current session

      const faceDangerCommandId = newId<CommandId>();
      const faceDanger = await invokeMove(db.sql, {
        campaignId,
        commandId: faceDangerCommandId,
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        rng: createSeededRandomSource(8), // miss, offers Pay the Price
      });

      const payThePriceCommandId = newId<CommandId>();
      const payThePrice = await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: payThePriceCommandId,
        actor: PLAYER,
        actorCharacterId: characterId,
        optionId: 'table',
        chainedFromCommandId: faceDangerCommandId,
        rng: createSeededRandomSource(20), // lands on "You are harmed" -> Endure Harm
      });
      expect(payThePrice.chain?.toMoveId).toBe('move:suffer/endure-harm');

      const endureHarmCommandId = newId<CommandId>();
      await invokeMove(db.sql, {
        campaignId,
        commandId: endureHarmCommandId,
        actor: PLAYER,
        moveId: 'move:suffer/endure-harm',
        actorCharacterId: characterId,
        adds: [],
        preRollAmount: -1,
        chainedFromCommandId: payThePriceCommandId,
        rng: createSeededRandomSource(1),
      });

      const beforeVoid = project(await readEvents(db.sql, campaignId));
      expect(beforeVoid.characters[characterId]?.meters.health.value).toBe(4); // 5 - 1

      const plan = await previewVoid(db.sql, campaignId, faceDanger.rollEventId);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.commands).toEqual(
          expect.arrayContaining([faceDangerCommandId, payThePriceCommandId, endureHarmCommandId]),
        );
      }

      await voidEvent(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: faceDanger.rollEventId,
        reason: 'Rook is forcing the bulkhead, not slipping past it — +iron, not +edge',
      });

      const afterVoid = project(await readEvents(db.sql, campaignId));
      // The whole chain — including Endure Harm's harm — never happened.
      expect(afterVoid.characters[characterId]?.meters.health.value).toBe(5);
    });
  });
});
