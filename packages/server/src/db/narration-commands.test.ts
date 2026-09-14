import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSeededRandomSource, type CharacterId, type MoveId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EventId,
} from '@astrolabe/shared';

import { AiStatus } from '../ai/status.js';
import { StubProvider } from '../ai/stub.js';
import type { TextSink } from '../ai/respond.js';
import { livePassages } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';

import { createCharacter } from './character-commands.js';
import { appendCommand, readEvents } from './event-store.js';
import { invokeMove, resolvePayThePriceMethod } from './move-commands.js';
import {
  AiRequestRefusedError,
  prepareBeatNarration,
  prepareCorrection,
  proposeAmount,
  runBeatNarration,
  runCorrection,
  type AiCommandResult,
  type NarrateBeatRequest,
} from './narration-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { previewVoid } from './void-command.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const ENDURE_HARM = 'move:suffer/endure-harm' as MoveId;

function recorder(): { sink: TextSink; frames: string[] } {
  const frames: string[] = [];
  return {
    frames,
    sink: {
      delta: (text) => frames.push(text),
      reset: (reason) => frames.push(`<reset: ${reason}>`),
    },
  };
}

describe.skipIf(!hasTestDatabase)('the AI commands (group 7)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('narration');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  interface Chain {
    readonly campaignId: CampaignId;
    readonly characterId: CharacterId;
    readonly faceDanger: CommandId;
    readonly faceDangerRoll: EventId;
    readonly payThePrice: CommandId;
    readonly endureHarm: CommandId;
  }

  /** Beat 7 through the real command layer: Face Danger miss → Pay the Price (table) → Endure Harm at −1. */
  async function beatSeven(): Promise<Chain> {
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
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: {
        name: 'Rook Ilari',
        callsign: 'Rook',
        stats: { edge: 1, heart: 2, iron: 2, shadow: 1, wits: 3 },
        assets: [],
      },
    });
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'session.begin',
      actor: PLAYER,
      events: [{ type: 'session.began', payload: { sessionId: newId(), number: 2 } }],
    });

    const faceDanger = newId<CommandId>();
    const invoked = await invokeMove(db.sql, {
      campaignId,
      commandId: faceDanger,
      actor: PLAYER,
      moveId: 'move:adventure/face-danger' as MoveId,
      actorCharacterId: characterId,
      using: { using: 'stat', stat: 'iron' },
      adds: [],
      actionText: 'Rook forces the sealed bulkhead.',
      rng: createSeededRandomSource(8),
    });
    const payThePrice = newId<CommandId>();
    await resolvePayThePriceMethod(db.sql, {
      campaignId,
      commandId: payThePrice,
      actor: PLAYER,
      actorCharacterId: characterId,
      optionId: 'table',
      chainedFromCommandId: faceDanger,
      rng: createSeededRandomSource(20),
    });
    const endureHarm = newId<CommandId>();
    await invokeMove(db.sql, {
      campaignId,
      commandId: endureHarm,
      actor: PLAYER,
      moveId: ENDURE_HARM,
      actorCharacterId: characterId,
      adds: [],
      preRollAmount: -1,
      chainedFromCommandId: payThePrice,
      rng: createSeededRandomSource(1),
    });

    return {
      campaignId,
      characterId,
      faceDanger,
      faceDangerRoll: invoked.rollEventId,
      payThePrice,
      endureHarm,
    };
  }

  async function narrate(
    ai: StubProvider,
    request: NarrateBeatRequest,
    status?: AiStatus,
  ): Promise<{ result: AiCommandResult; frames: string[] }> {
    const { sink, frames } = recorder();
    const prepared = await prepareBeatNarration(db.sql, request);
    const result =
      prepared.kind === 'replay'
        ? prepared.result
        : await runBeatNarration(db.sql, ai, prepared, sink, status);
    return { result, frames };
  }

  describe('beat narration (task 7.8, D-110)', () => {
    it('streams one passage for the whole chain and commits it with its tokens', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          {
            kind: 'text',
            text: 'Sparks spray across Rook’s arm as the bulkhead groans open.',
            usage: { inputTokens: 900, outputTokens: 60, cacheReadTokens: 1500 },
          },
        ],
        chunkSize: 10,
      });
      const commandId = newId<CommandId>();

      const { result, frames } = await narrate(ai, {
        campaignId: chain.campaignId,
        commandId,
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });

      expect(result.ok).toBe(true);
      expect(frames.join('')).toBe('Sparks spray across Rook’s arm as the bulkhead groans open.');

      // The AI heard the whole chain, starting from the declared action.
      expect(ai.requests[0]?.user).toContain(
        'The player declared: "Rook forces the sealed bulkhead."',
      );
      expect(ai.requests[0]?.user).toContain('This leads to Endure Harm.');

      const events = await readEvents(db.sql, chain.campaignId);
      const written = events.filter((e) => e.commandId === commandId);
      expect(written.map((e) => e.type)).toEqual(['ai.completed', 'narration.written']);
      expect(written.every((e) => e.actor.kind === 'ai')).toBe(true);
      // Hung off the last thing the chain did.
      const chainEvents = events.filter((e) => e.seq < written[0]!.seq);
      expect(written[0]?.causedBy).toBe(chainEvents.at(-1)?.id);

      expect(project(events).session?.tokenUsage).toEqual({
        input: 900,
        output: 60,
        cacheRead: 1500,
        cacheWrite: 0,
      });
    });

    it('re-asks after a rejected attempt and counts both attempts', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          { kind: 'text', text: 'The bulkhead gi', stopReason: 'max_tokens' },
          { kind: 'text', text: 'The bulkhead gives.' },
        ],
      });
      const commandId = newId<CommandId>();

      const { result, frames } = await narrate(ai, {
        campaignId: chain.campaignId,
        commandId,
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });

      expect(result.ok).toBe(true);
      expect(frames.some((f) => f.startsWith('<reset'))).toBe(true);
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'narration.written',
      ]);
    });

    it('records an outage as ai.failed, leaves state intact, and lets a retry succeed (D-116)', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [{ kind: 'error', errorKind: 'unavailable', message: 'overloaded' }],
      });
      const status = new AiStatus(ai);
      const before = project(await readEvents(db.sql, chain.campaignId));

      const failed = await narrate(
        ai,
        {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        status,
      );

      expect(failed.result).toEqual({ ok: false, errorKind: 'unavailable', message: 'overloaded' });
      expect(status.snapshot()).toMatchObject({
        available: false,
        lastFailure: { errorKind: 'unavailable' },
      });
      const events = await readEvents(db.sql, chain.campaignId);
      expect(events.some((e) => e.type === 'narration.written')).toBe(false);
      expect(events.at(-1)?.type).toBe('ai.failed');
      expect(project(events).characters).toEqual(before.characters);

      const retried = await narrate(
        ai,
        {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        status,
      );
      expect(retried.result.ok).toBe(true);
      expect(status.snapshot().available).toBe(true);
    });

    it('replays a committed command without calling the provider again', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider();
      const request = {
        campaignId: chain.campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      };

      const first = await narrate(ai, request);
      const second = await narrate(ai, request);

      expect(second.result).toEqual(first.result);
      expect(ai.requests).toHaveLength(1);
    });

    it('refuses a chain that already has its passage, from any link', async () => {
      const chain = await beatSeven();
      await narrate(new StubProvider(), {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });

      await expect(
        prepareBeatNarration(db.sql, {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          afterCommandId: chain.faceDanger,
        }),
      ).rejects.toMatchObject({ reason: 'already_narrated' });
    });

    it('is voided with the chain it narrates (D-83)', async () => {
      const chain = await beatSeven();
      const { result } = await narrate(new StubProvider(), {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });
      if (!result.ok) throw new Error(result.message);

      const plan = await previewVoid(db.sql, chain.campaignId, chain.faceDangerRoll);

      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.cascaded).toContain(result.eventId);
      }
    });

    it('refuses a command that is not a move', async () => {
      const chain = await beatSeven();
      const events = await readEvents(db.sql, chain.campaignId);
      await expect(
        prepareBeatNarration(db.sql, {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          afterCommandId: events[0]!.commandId,
        }),
      ).rejects.toThrow(AiRequestRefusedError);
    });
  });

  describe('narration correction (task 7.9, A15)', () => {
    async function narrated(text: string) {
      const chain = await beatSeven();
      const { result } = await narrate(new StubProvider({ responses: [{ kind: 'text', text }] }), {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });
      if (!result.ok) throw new Error(result.message);
      return { chain, passageId: result.eventId };
    }

    it('writes the note, streams the rewrite, and supersedes the passage in one action', async () => {
      const { chain, passageId } = await narrated('Rook looks shaken as the sparks die.');
      const ai = new StubProvider({
        responses: [{ kind: 'text', text: 'Rook looks annoyed as the sparks die.' }],
      });
      const { sink, frames } = recorder();

      const prepared = await prepareCorrection(db.sql, {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: passageId,
        note: 'Rook is a veteran — annoyed, not rattled.',
      });
      if (prepared.kind !== 'run') throw new Error('expected a run');
      const result = await runCorrection(db.sql, ai, prepared, sink);

      expect(result.ok).toBe(true);
      expect(frames.join('')).toBe('Rook looks annoyed as the sparks die.');
      expect(ai.requests[0]?.user).toContain('Rook looks shaken as the sparks die.');
      expect(ai.requests[0]?.user).toContain('Rook is a veteran — annoyed, not rattled.');

      const events = await readEvents(db.sql, chain.campaignId);
      expect(livePassages(events).find((p) => p.eventId === passageId)?.text).toBe(
        'Rook looks annoyed as the sparks die.',
      );
      const revision = events.find((e) => e.type === 'narration.revised');
      expect(revision?.causedBy).toBe(prepared.requestEventId);
      expect(events.filter((e) => e.commandId === revision?.commandId).map((e) => e.type)).toEqual([
        'ai.completed',
        'narration.revised',
      ]);
      // Nothing mechanical changed.
      expect(project(events).characters[chain.characterId]?.meters.health.value).toBe(4);
    });

    it('keeps the flag when the rewrite fails, and records why', async () => {
      const { chain, passageId } = await narrated('Rook looks shaken.');
      const ai = new StubProvider({
        responses: [{ kind: 'error', errorKind: 'rate_limited', message: 'slow down' }],
      });

      const prepared = await prepareCorrection(db.sql, {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: passageId,
        note: 'Annoyed, not shaken.',
      });
      if (prepared.kind !== 'run') throw new Error('expected a run');
      const result = await runCorrection(db.sql, ai, prepared, recorder().sink);

      expect(result).toMatchObject({ ok: false, errorKind: 'rate_limited' });
      const events = await readEvents(db.sql, chain.campaignId);
      expect(events.some((e) => e.type === 'narration.correction_requested')).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: 'ai.failed', causedBy: prepared.requestEventId });
      expect(livePassages(events).find((p) => p.eventId === passageId)?.text).toBe(
        'Rook looks shaken.',
      );
    });

    it('refuses to correct something that is not a passage', async () => {
      const chain = await beatSeven();
      await expect(
        prepareCorrection(db.sql, {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          targetEventId: chain.faceDangerRoll,
          note: 'no',
        }),
      ).rejects.toMatchObject({ reason: 'not_narration' });
    });
  });

  describe('proposed amount (D-118, A13)', () => {
    it('proposes an in-range amount from the chain’s fiction, re-asking once if out of range', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          {
            kind: 'structured',
            value: { amount: -5, injury: 'Everything at once.', reason: 'Far too much.' },
          },
          {
            kind: 'structured',
            value: {
              amount: -2,
              injury: "A ruptured conduit sprays sparks across Rook's arm.",
              reason: 'A serious burn.',
            },
          },
        ],
      });

      const result = await proposeAmount(db.sql, ai, {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveId: ENDURE_HARM,
        actorCharacterId: chain.characterId,
        chainedFromCommandId: chain.payThePrice,
      });

      expect(result).toMatchObject({
        ok: true,
        amount: -2,
        injury: "A ruptured conduit sprays sparks across Rook's arm.",
        reason: 'A serious burn.',
      });
      expect(ai.requests[0]?.user).toContain('Oracle result');
      const events = await readEvents(db.sql, chain.campaignId);
      const proposal = events.find((e) => e.type === 'amount.proposed');
      expect(proposal).toMatchObject({
        actor: { kind: 'ai' },
        subjectCharacterId: chain.characterId,
        payload: { injury: "A ruptured conduit sprays sparks across Rook's arm." },
      });
      expect(proposal?.causedBy).not.toBeNull();
      expect(events.filter((e) => e.commandId === proposal?.commandId).map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'amount.proposed',
      ]);
    });

    it('fails cleanly without a credential, writing ai.failed', async () => {
      const chain = await beatSeven();
      const result = await proposeAmount(db.sql, new StubProvider({ configured: false }), {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveId: ENDURE_HARM,
        actorCharacterId: chain.characterId,
      });

      expect(result).toMatchObject({ ok: false, errorKind: 'not_configured' });
      expect((await readEvents(db.sql, chain.campaignId)).at(-1)?.type).toBe('ai.failed');
    });

    it('refuses a move with no amount to propose', async () => {
      const chain = await beatSeven();
      await expect(
        proposeAmount(db.sql, new StubProvider(), {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          moveId: 'move:adventure/face-danger' as MoveId,
          actorCharacterId: chain.characterId,
        }),
      ).rejects.toMatchObject({ reason: 'no_proposed_amount' });
    });
  });
});
