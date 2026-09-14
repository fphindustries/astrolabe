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
import { StubProvider, type StubResponse } from '../ai/stub.js';
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

/** A scripted D-127 passage. In beatSeven, F1 is Rook's Face Danger and F2 the declared action. */
function passage(
  ...segments: readonly (readonly [
    about: string,
    character: string | null,
    basis: string[],
    text: string,
  ])[]
): Extract<StubResponse, { kind: 'structured' }> {
  return {
    kind: 'structured',
    value: {
      segments: segments.map(([about, character, basis, text]) => ({
        about,
        character,
        basis,
        text,
      })),
    },
  };
}

/** The streamed text alone, without the frames around it. */
const shownText = (frames: readonly string[]) => frames.filter((f) => !f.startsWith('<')).join('');

/** A scripted checker verdict (D-128). */
function verdict(
  ...violations: readonly {
    rule: 'undeclared_action' | 'player_interior' | 'voice' | 'injury';
    quote: string;
    segment?: number | null;
    character?: string | null;
    why?: string;
  }[]
): Extract<StubResponse, { kind: 'structured' }> {
  return {
    kind: 'structured',
    value: {
      review: 'Recorded verdict.',
      violations: violations.map((v) => ({
        rule: v.rule,
        character: v.character ?? 'Rook',
        segment: v.segment ?? null,
        quote: v.quote,
        why: v.why ?? 'Recorded verdict.',
      })),
    },
  };
}

function recorder(): { sink: TextSink; frames: string[] } {
  const frames: string[] = [];
  return {
    frames,
    sink: {
      delta: (text) => frames.push(text),
      reset: (reason) => frames.push(`<reset: ${reason}>`),
      checking: () => frames.push('<checking>'),
      withdrawn: (reason) => frames.push(`<withdrawn: ${reason}>`),
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
    checker: StubProvider = new StubProvider(),
  ): Promise<{ result: AiCommandResult; frames: string[] }> {
    const { sink, frames } = recorder();
    const prepared = await prepareBeatNarration(db.sql, request);
    const result =
      prepared.kind === 'replay'
        ? prepared.result
        : await runBeatNarration(db.sql, ai, checker, prepared, sink, status);
    return { result, frames };
  }

  describe('beat narration (task 7.8, D-110)', () => {
    it('grounds the passage in the oracle rolls its segments cite (8.2, D-17)', async () => {
      const chain = await beatSeven();
      const request = {
        campaignId: chain.campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      };
      const prepared = await prepareBeatNarration(db.sql, request);
      if (prepared.kind !== 'run') throw new Error('expected a run');
      const roll = prepared.segments.facts.find((fact) => fact.grounds !== undefined);
      if (roll === undefined) throw new Error('expected the Pay the Price roll as a fact');
      const ai = new StubProvider({
        responses: [
          passage(
            ['world', null, [roll.key], 'The bulkhead’s seal lets go all at once.'],
            ['world', null, [], 'Somewhere below, a pump coughs.'],
          ),
        ],
      });

      const result = await runBeatNarration(
        db.sql,
        ai,
        new StubProvider(),
        prepared,
        recorder().sink,
      );

      if (!result.ok) throw new Error(result.message);
      const written = (await readEvents(db.sql, chain.campaignId)).find(
        (e) => e.id === result.eventId,
      );
      expect(written).toMatchObject({ payload: { groundedIn: roll.grounds } });
    });

    it('streams one passage for the whole chain and commits it with its tokens', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          {
            ...passage(
              ['character_does', 'Rook', ['F2'], 'Rook forces the bulkhead.'],
              ['character_undergoes', 'Rook', ['F1'], 'Sparks spray across Rook’s arm.'],
              ['world', null, [], 'The bulkhead groans open.'],
            ),
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
      const text =
        'Rook forces the bulkhead. Sparks spray across Rook’s arm. The bulkhead groans open.';
      expect(shownText(frames)).toBe(text);
      // Checked after it arrived, before it was kept (D-128).
      expect(frames.at(-1)).toBe('<checking>');

      // The AI heard the whole chain, starting from the declared action, as keyed facts.
      expect(ai.requests[0]?.user).toContain(
        '[F2] (declared action, Rook) The player declared: "Rook forces the sealed bulkhead."',
      );
      expect(ai.requests[0]?.user).toContain('This leads to Endure Harm.');

      const events = await readEvents(db.sql, chain.campaignId);
      const written = events.filter((e) => e.commandId === commandId);
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'narration.written',
      ]);
      expect(written[1]?.payload).toMatchObject({ provider: 'stub', purpose: 'narration_check' });
      // Committed as the segments joined, with each basis resolved to the events behind it.
      const invoked = events.find(
        (e) => e.commandId === chain.faceDanger && e.type === 'move.invoked',
      );
      expect(written[2]?.payload).toMatchObject({
        text,
        segments: [
          { about: 'character_does', characterId: chain.characterId, basis: [invoked?.id] },
          { about: 'character_undergoes', characterId: chain.characterId, basis: [invoked?.id] },
          { about: 'world', characterId: null, basis: [] },
        ],
      });
      expect(written.every((e) => e.actor.kind === 'ai')).toBe(true);
      // Hung off the last thing the chain did.
      const chainEvents = events.filter((e) => e.seq < written[0]!.seq);
      expect(written[0]?.causedBy).toBe(chainEvents.at(-1)?.id);

      // The narrator's tokens plus the checker's (the stub's default 100 in, 20 out).
      expect(project(events).session?.tokenUsage).toEqual({
        input: 1000,
        output: 80,
        cacheRead: 1500,
        cacheWrite: 0,
      });
    });

    it('re-asks after a rejected attempt and counts both attempts', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          { ...passage(['world', null, [], 'The bulkhead gi']), stopReason: 'max_tokens' },
          passage(['world', null, [], 'The bulkhead gives.']),
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
      // A cut-off reply is not an authority finding: reset, not withdrawn (D-128, amended).
      expect(frames.some((f) => f.startsWith('<withdrawn'))).toBe(false);
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'narration.written',
      ]);
    });

    it('never shows an undeclared action, and withdraws the attempt with its reason (D-127, D-128)', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          passage(
            ['world', null, [], 'The bulkhead groans open.'],
            // Round 20's undeclared next step, labelled honestly.
            ['character_does', 'Rook', ['F9'], 'Rook steps sideways through the gap.'],
          ),
          passage(['world', null, [], 'The bulkhead groans open.']),
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
      expect(shownText(frames)).not.toContain('steps sideways');
      expect(frames).toContain(
        '<withdrawn: Withdrawn: it narrated Rook doing something the player did not declare for Rook in this beat.>',
      );
      expect(ai.requests[1]?.user).toContain(
        'Your previous answer was rejected: It narrated Rook doing something',
      );
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'narration.withdrawn',
        'narration.written',
      ]);
      expect(written[3]?.payload).toMatchObject({
        role: 'beat',
        attempt: 1,
        checker: 'segment_checks',
        latitude: 'color',
        rejectedText: 'The bulkhead groans open. Rook steps sideways through the gap.',
        violations: [{ rule: 'segment_check' }],
      });
    });

    it('withdraws a passage the checker finds, quoted, and re-asks with the quote (D-128)', async () => {
      const chain = await beatSeven();
      // Round 20's disposition with a history, written as undergoing — what D-127 can't see.
      const breaking = passage([
        'character_undergoes',
        'Rook',
        ['F1'],
        'The pain gets folded and stowed, the way it has been for thirty years.',
      ]);
      const ai = new StubProvider({
        responses: [breaking, passage(['character_undergoes', 'Rook', ['F1'], 'The burn stings.'])],
      });
      const checker = new StubProvider({
        responses: [
          verdict({
            rule: 'player_interior',
            segment: 0,
            quote: 'the way it has been for thirty years',
            why: 'A history and a disposition.',
          }),
          verdict(),
        ],
      });
      const commandId = newId<CommandId>();

      const { result, frames } = await narrate(
        ai,
        {
          campaignId: chain.campaignId,
          commandId,
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        undefined,
        checker,
      );

      expect(result.ok).toBe(true);
      // The text was shown provisionally, then struck with its reason — never quietly replaced.
      expect(frames).toContain(
        '<withdrawn: Withdrawn: it said what Rook thinks, feels or characteristically does, which is the player’s to decide.>',
      );
      expect(ai.requests[1]?.user).toContain('"the way it has been for thirty years"');
      expect(checker.requests[0]?.user).toContain(
        '[0] (character_undergoes, Rook) The pain gets folded',
      );
      expect(checker.requests[0]?.system[0]?.text).toContain('Player-owned interior');

      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'narration.withdrawn',
        'narration.written',
      ]);
      expect(written.find((e) => e.type === 'narration.withdrawn')?.payload).toMatchObject({
        checker: 'authority_check',
        model: 'stub',
        rejectedText: 'The pain gets folded and stowed, the way it has been for thirty years.',
        violations: [{ rule: 'player_interior', character: 'Rook', segment: 0 }],
      });
      expect(written.at(-1)?.payload).toMatchObject({ text: 'The burn stings.' });
    });

    it('pauses play when the re-ask is withdrawn too (D-128)', async () => {
      const chain = await beatSeven();
      const breaking = passage(['character_undergoes', 'Rook', ['F1'], 'Rook is unshaken by it.']);
      const flagged = verdict({ rule: 'player_interior', quote: 'unshaken by it', segment: 0 });
      const commandId = newId<CommandId>();

      const { result } = await narrate(
        new StubProvider({ responses: [breaking, breaking] }),
        {
          campaignId: chain.campaignId,
          commandId,
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        undefined,
        new StubProvider({ responses: [flagged, flagged] }),
      );

      expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'narration.withdrawn',
        'narration.withdrawn',
        'ai.failed',
      ]);
      expect(written.at(-1)?.payload).toMatchObject({ provider: 'stub', purpose: 'beat' });
    });

    it('fails closed when the checker is unavailable, withdrawing what was shown (D-128)', async () => {
      const chain = await beatSeven();
      const commandId = newId<CommandId>();
      const status = new AiStatus(new StubProvider());

      const { result, frames } = await narrate(
        new StubProvider({ responses: [passage(['world', null, [], 'The bulkhead gives.'])] }),
        {
          campaignId: chain.campaignId,
          commandId,
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        status,
        new StubProvider({
          responses: [{ kind: 'error', errorKind: 'rejected', message: 'bad model' }],
        }),
      );

      expect(result).toMatchObject({ ok: false, errorKind: 'rejected' });
      expect(frames).toContain(
        '<withdrawn: Withdrawn: it could not be checked, and an unchecked passage is never kept.>',
      );
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'narration.withdrawn',
        'ai.failed',
      ]);
      expect(written.at(-1)?.payload).toMatchObject({
        purpose: 'narration_check',
        errorKind: 'rejected',
      });
      expect(written.some((e) => e.type === 'narration.written')).toBe(false);
      expect(status.snapshot()).toMatchObject({ available: false });
    });

    it('re-asks a checker whose quote is not verbatim, then fails closed (D-128)', async () => {
      const chain = await beatSeven();
      const invented = verdict({
        rule: 'undeclared_action',
        quote: 'Rook sprints away',
        segment: 0,
      });
      const checker = new StubProvider({ responses: [invented, invented] });
      const commandId = newId<CommandId>();

      const { result } = await narrate(
        new StubProvider({ responses: [passage(['world', null, [], 'The bulkhead gives.'])] }),
        {
          campaignId: chain.campaignId,
          commandId,
          actor: PLAYER,
          afterCommandId: chain.endureHarm,
        },
        undefined,
        checker,
      );

      expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
      expect(checker.requests[1]?.user).toContain(
        'quote "Rook sprints away" does not appear verbatim in segment 0',
      );
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'ai.completed',
        'narration.withdrawn',
        'ai.failed',
      ]);
    });

    it('fails as invalid output when the re-ask breaks the checks too (D-127, D-116)', async () => {
      const chain = await beatSeven();
      const named = passage(['world', null, [], 'Sparks spray across Rook’s arm.']);
      const ai = new StubProvider({ responses: [named, named] });
      const commandId = newId<CommandId>();

      const { result, frames } = await narrate(ai, {
        campaignId: chain.campaignId,
        commandId,
        actor: PLAYER,
        afterCommandId: chain.endureHarm,
      });

      expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
      // Whole words before the name may be released; the name never is.
      expect(shownText(frames)).not.toContain('Rook');
      expect(frames.filter((f) => f.startsWith('<withdrawn'))).toHaveLength(2);
      const written = (await readEvents(db.sql, chain.campaignId)).filter(
        (e) => e.commandId === commandId,
      );
      expect(written.map((e) => e.type)).toEqual([
        'ai.completed',
        'ai.completed',
        'narration.withdrawn',
        'narration.withdrawn',
        'ai.failed',
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
      // What no check without AI can catch (D-127): an emotion labelled as undergoing.
      const response = passage(['character_undergoes', 'Rook', ['F1'], text]);
      const { result } = await narrate(new StubProvider({ responses: [response] }), {
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
      const result = await runCorrection(db.sql, ai, new StubProvider(), prepared, sink);

      expect(result.ok).toBe(true);
      expect(shownText(frames)).toBe('Rook looks annoyed as the sparks die.');
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
        'ai.completed',
        'narration.revised',
      ]);
      // Nothing mechanical changed.
      expect(project(events).characters[chain.characterId]?.meters.health.value).toBe(4);
    });

    it('withdraws a rewrite that breaks the rubric, naming the passage it was rewriting (D-128)', async () => {
      const { chain, passageId } = await narrated('Rook looks shaken.');
      const ai = new StubProvider({
        responses: [
          { kind: 'text', text: 'Rook looks annoyed, the way Rook always does.' },
          { kind: 'text', text: 'The sparks die.' },
        ],
      });
      const checker = new StubProvider({
        responses: [
          verdict({ rule: 'player_interior', quote: 'the way Rook always does' }),
          verdict(),
        ],
      });
      const { sink, frames } = recorder();

      const prepared = await prepareCorrection(db.sql, {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: passageId,
        note: 'Annoyed, not shaken.',
      });
      if (prepared.kind !== 'run') throw new Error('expected a run');
      const result = await runCorrection(db.sql, ai, checker, prepared, sink);

      expect(result.ok).toBe(true);
      expect(frames.some((f) => f.startsWith('<withdrawn'))).toBe(true);
      const events = await readEvents(db.sql, chain.campaignId);
      expect(events.find((e) => e.type === 'narration.withdrawn')?.payload).toMatchObject({
        role: 'revision',
        targetEventId: passageId,
        rejectedText: 'Rook looks annoyed, the way Rook always does.',
      });
      expect(livePassages(events).find((p) => p.eventId === passageId)?.text).toBe(
        'The sparks die.',
      );
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
      const result = await runCorrection(db.sql, ai, new StubProvider(), prepared, recorder().sink);

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

      const result = await proposeAmount(db.sql, ai, new StubProvider(), {
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
        'ai.completed',
        'amount.proposed',
      ]);
    });

    it('checks the injury before proposing it, and records a withdrawn one (D-128, D-130)', async () => {
      const chain = await beatSeven();
      const ai = new StubProvider({
        responses: [
          {
            kind: 'structured',
            // Round 20's harm reason: an undeclared action inside the injury.
            value: {
              amount: -2,
              injury:
                "The hatch edge bites Rook's shoulder as Rook forces the relay's inner hatch.",
              reason: 'Deep.',
            },
          },
          {
            kind: 'structured',
            value: { amount: -2, injury: "The hatch edge bites Rook's shoulder.", reason: 'Deep.' },
          },
        ],
      });
      const checker = new StubProvider({
        responses: [
          verdict({ rule: 'undeclared_action', quote: "as Rook forces the relay's inner hatch" }),
          verdict(),
        ],
      });

      const result = await proposeAmount(db.sql, ai, checker, {
        campaignId: chain.campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveId: ENDURE_HARM,
        actorCharacterId: chain.characterId,
      });

      expect(result).toMatchObject({ ok: true, injury: "The hatch edge bites Rook's shoulder." });
      expect(checker.requests[0]?.user).toContain(
        'It must describe only what happens to the character',
      );
      expect(ai.requests[1]?.user).toContain('"as Rook forces the relay\'s inner hatch"');
      const events = await readEvents(db.sql, chain.campaignId);
      const withdrawn = events.find((e) => e.type === 'narration.withdrawn');
      expect(withdrawn?.payload).toMatchObject({
        role: 'injury',
        checker: 'authority_check',
        rejectedText:
          "The hatch edge bites Rook's shoulder as Rook forces the relay's inner hatch.",
        violations: [{ rule: 'undeclared_action', character: 'Rook' }],
      });
    });

    it('fails cleanly without a credential, writing ai.failed', async () => {
      const chain = await beatSeven();
      const result = await proposeAmount(
        db.sql,
        new StubProvider({ configured: false }),
        new StubProvider(),
        {
          campaignId: chain.campaignId,
          commandId: newId(),
          actor: PLAYER,
          moveId: ENDURE_HARM,
          actorCharacterId: chain.characterId,
        },
      );

      expect(result).toMatchObject({ ok: false, errorKind: 'not_configured' });
      expect((await readEvents(db.sql, chain.campaignId)).at(-1)?.type).toBe('ai.failed');
    });

    it('refuses a move with no amount to propose', async () => {
      const chain = await beatSeven();
      await expect(
        proposeAmount(db.sql, new StubProvider(), new StubProvider(), {
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
