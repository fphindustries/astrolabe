import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CommandId, type EventId } from '@astrolabe/shared';

import { whatNowAnchors } from '../ai/context/index.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import {
  SESSION_ONE,
  SESSION_ONE_CAMPAIGN_ID,
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { project } from '../projection/project.js';

import { readEvents } from './event-store.js';
import { MoveRejectedError, invokeMove } from './move-commands.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { checkTrigger, suggestActions, suggestMove } from './suggestion-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { voidEvent } from './void-command.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const campaignId = SESSION_TWO_OPEN_CAMPAIGN_ID;
const ACTION = 'Juno jacks into the docking port and pulls the station logs.';

const gatherInformation = {
  moveId: 'move:adventure/gather-information',
  rollOption: 'wits',
  triggerText: 'conduct an investigation',
  reason: 'Pulling the logs is an investigation.',
  confidence: 'high',
};

describe.skipIf(!hasTestDatabase)('move suggestions (task 7.12, D-120, D-135)', () => {
  let db: TestDatabase;
  let juno: CharacterId;
  let rook: CharacterId;
  let byCallsign: (callsign: string) => CharacterId;

  beforeAll(async () => {
    db = await createTestDatabase('suggestions');
    await seedFixture(db.sql, SESSION_TWO_OPEN);
    const state = project(await readEvents(db.sql, campaignId));
    byCallsign = (callsign: string) =>
      Object.values(state.characters).find((c) => c.callsign === callsign)?.id as CharacterId;
    juno = byCallsign('Juno');
    rook = byCallsign('Rook');
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  const ask = (ai: StubProvider, overrides: { commandId?: CommandId; actionText?: string } = {}) =>
    suggestMove(db.sql, ai, {
      campaignId,
      commandId: overrides.commandId ?? newId<CommandId>(),
      actor: PLAYER,
      actorCharacterId: juno,
      actionText: overrides.actionText ?? ACTION,
    });

  it('writes the accounting and the suggestion in the open session, changing nothing', async () => {
    const before = project(await readEvents(db.sql, campaignId));
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: gatherInformation }] });
    const commandId = newId<CommandId>();

    const result = await ask(ai, { commandId, actionText: `  ${ACTION} ` });

    expect(result).toMatchObject({
      ok: true,
      suggestion: {
        actorCharacterId: juno,
        actionText: ACTION,
        moveId: 'move:adventure/gather-information',
        rollOption: { using: 'stat', stat: 'wits' },
        triggerText: 'conduct an investigation',
        confidence: 'high',
      },
    });
    const asked = ai.requests[0];
    expect(asked?.purpose).toBe('move_suggestion');
    expect(asked?.user).toContain('<acting>Juno Marr, called Juno</acting>');

    const events = await readEvents(db.sql, campaignId);
    const written = events.filter((e) => e.commandId === commandId);
    expect(written.map((e) => e.type)).toEqual(['ai.completed', 'move.suggested']);
    expect(written.every((e) => e.sessionId === before.session?.id)).toBe(true);
    const after = project(events);
    expect(after.characters).toEqual(before.characters);
    expect(after.session?.tokenUsage.input).toBe((before.session?.tokenUsage.input ?? 0) + 100);
  });

  it('replays without asking again', async () => {
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: gatherInformation }] });
    const commandId = newId<CommandId>();

    const first = await ask(ai, { commandId });
    const again = await ask(ai, { commandId });

    expect(again).toEqual(first);
    expect(ai.requests).toHaveLength(1);
  });

  it('re-asks with the quote problem stated, then records a failure with no suggestion', async () => {
    const misquoted = {
      kind: 'structured' as const,
      value: { ...gatherInformation, triggerText: 'When you pull the station logs' },
    };
    const ai = new StubProvider({ responses: [misquoted, misquoted] });
    const commandId = newId<CommandId>();

    const result = await ask(ai, { commandId });

    expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    expect(ai.requests[1]?.user).toMatch(/is not in Gather Information's trigger/);
    const types = (await readEvents(db.sql, campaignId))
      .filter((e) => e.commandId === commandId)
      .map((e) => e.type);
    expect(types).toEqual(['ai.completed', 'ai.completed', 'ai.failed']);
  });

  it('records "no move fits" with its reason and nothing to roll or quote', async () => {
    const ai = new StubProvider({
      responses: [
        {
          kind: 'structured',
          value: {
            moveId: null,
            rollOption: null,
            triggerText: null,
            reason: 'Closing a hatch behind you carries no risk worth a roll.',
            confidence: 'medium',
          },
        },
      ],
    });

    const result = await ask(ai, { actionText: 'Juno closes the hatch behind her.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion).toEqual({
      actorCharacterId: juno,
      actionText: 'Juno closes the hatch behind her.',
      moveId: null,
      reason: 'Closing a hatch behind you carries no risk worth a roll.',
      confidence: 'medium',
    });
  });

  it('records an outage as a failure', async () => {
    const ai = new StubProvider({ responses: [{ kind: 'error', errorKind: 'unavailable' }] });
    expect(await ask(ai)).toMatchObject({ ok: false, errorKind: 'unavailable' });
  });

  it('refuses an empty action or an unknown character before asking', async () => {
    const ai = new StubProvider();
    await expect(ask(ai, { actionText: '   ' })).rejects.toBeInstanceOf(AiRequestRefusedError);
    await expect(
      suggestMove(db.sql, ai, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        actorCharacterId: newId<CharacterId>(),
        actionText: ACTION,
      }),
    ).rejects.toBeInstanceOf(AiRequestRefusedError);
    expect(ai.requests).toHaveLength(0);
  });

  describe('a move filled from a suggestion', () => {
    async function suggested(): Promise<EventId> {
      const result = await ask(
        new StubProvider({ responses: [{ kind: 'structured', value: gatherInformation }] }),
      );
      if (!result.ok) throw new Error('expected a suggestion');
      return result.eventId;
    }

    const invoke = (suggestionEventId: EventId, overrides: Record<string, unknown> = {}) =>
      invokeMove(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        moveId: 'move:adventure/gather-information',
        actorCharacterId: juno,
        using: { using: 'stat', stat: 'wits' },
        adds: [],
        actionText: ACTION,
        suggestionEventId,
        rng: actionRoll(4, [2, 9]),
        ...overrides,
      });

    it('names the suggestion on the invocation, and not as its cause (D-135)', async () => {
      const suggestionEventId = await suggested();

      const invoked = await invoke(suggestionEventId);

      const move = invoked.result.events.find((e) => e.type === 'move.invoked');
      expect(move?.type === 'move.invoked' && move.payload.suggestionEventId).toBe(
        suggestionEventId,
      );
      expect(move?.causedBy).toBeNull();
    });

    it('refuses a suggestion for another move or character, an id that is not one, or a voided one', async () => {
      const suggestionEventId = await suggested();

      await expect(
        invoke(suggestionEventId, {
          moveId: 'move:adventure/face-danger',
          using: { using: 'stat', stat: 'wits' },
        }),
      ).rejects.toThrow(/different move or character/);
      await expect(invoke(suggestionEventId, { actorCharacterId: rook })).rejects.toThrow(
        /different move or character/,
      );
      await expect(invoke(newId<EventId>())).rejects.toBeInstanceOf(MoveRejectedError);

      await voidEvent(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: suggestionEventId,
        reason: 'Asked about the wrong character.',
      });
      await expect(invoke(suggestionEventId)).rejects.toThrow(/has been voided/);
    });
  });

  describe('the trigger-mismatch note (7.13, D-136)', () => {
    const mismatch = {
      fits: false,
      triggerText: 'When you attempt something risky',
      reason: 'Reading the logs carries no risk or threat.',
      confidence: 'medium',
    };

    /** Juno rolls Face Danger for reading logs, as the player typed it. */
    async function rolled(overrides: Record<string, unknown> = {}): Promise<CommandId> {
      const commandId = newId<CommandId>();
      await invokeMove(db.sql, {
        campaignId,
        commandId,
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: juno,
        using: { using: 'stat', stat: 'wits' },
        adds: [],
        actionText: 'Juno reads the station logs.',
        rng: actionRoll(4, [2, 9]),
        ...overrides,
      });
      return commandId;
    }

    const check = (ai: StubProvider, moveCommandId: CommandId, commandId = newId<CommandId>()) =>
      checkTrigger(db.sql, ai, { campaignId, commandId, actor: PLAYER, moveCommandId });

    it('writes a note caused by the move, which a void of the move takes with it', async () => {
      const moveCommandId = await rolled();
      const ai = new StubProvider({ responses: [{ kind: 'structured', value: mismatch }] });
      const commandId = newId<CommandId>();

      const result = await check(ai, moveCommandId, commandId);

      expect(result).toMatchObject({
        ok: true,
        fits: false,
        note: {
          moveId: 'move:adventure/face-danger',
          actionText: 'Juno reads the station logs.',
          triggerText: 'When you attempt something risky',
          confidence: 'medium',
        },
      });
      expect(ai.requests[0]?.purpose).toBe('trigger_check');
      const events = await readEvents(db.sql, campaignId);
      const invoked = events.find(
        (e) => e.commandId === moveCommandId && e.type === 'move.invoked',
      );
      const written = events.filter((e) => e.commandId === commandId);
      expect(written.map((e) => e.type)).toEqual(['ai.completed', 'move.trigger_noted']);
      expect(written.every((e) => e.causedBy === invoked?.id)).toBe(true);

      const voided = await voidEvent(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: invoked!.id,
        reason: 'Wrong move for reading logs.',
      });
      const voidedIds = voided.events.flatMap((e) =>
        e.type === 'event.voided' ? [e.payload.targetEventId, ...e.payload.cascaded] : [],
      );
      expect(voidedIds).toContain(written[1]?.id);
    });

    it('writes only the accounting when the move fits, and replays the answer', async () => {
      const moveCommandId = await rolled({ actionText: 'Juno leaps the gap as the deck buckles.' });
      const ai = new StubProvider({
        responses: [
          {
            kind: 'structured',
            value: { fits: true, triggerText: null, reason: 'A risky leap.', confidence: 'high' },
          },
        ],
      });
      const commandId = newId<CommandId>();

      const first = await check(ai, moveCommandId, commandId);
      const again = await check(ai, moveCommandId, commandId);

      expect(first).toEqual({ ok: true, fits: true });
      expect(again).toEqual(first);
      expect(ai.requests).toHaveLength(1);
      const types = (await readEvents(db.sql, campaignId))
        .filter((e) => e.commandId === commandId)
        .map((e) => e.type);
      expect(types).toEqual(['ai.completed']);
    });

    it('re-asks a mismatch that quotes condition text, then records the failure', async () => {
      const moveCommandId = await rolled();
      const condition = {
        kind: 'structured' as const,
        value: { ...mismatch, triggerText: 'With expertise, focus, or observation' },
      };
      const ai = new StubProvider({ responses: [condition, condition] });

      const result = await check(ai, moveCommandId);

      expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
      expect(ai.requests[1]?.user).toMatch(/is not in Face Danger's trigger/);
    });

    it('refuses a second check, a move with no action, one filled from a suggestion, and a command that is not a move', async () => {
      const once = await rolled();
      await check(new StubProvider({ responses: [{ kind: 'structured', value: mismatch }] }), once);
      await expect(check(new StubProvider(), once)).rejects.toMatchObject({
        reason: 'already_checked',
      });

      // D-136: a failed check is not retried either; the note is optional help.
      const failedOnce = await rolled();
      await check(
        new StubProvider({ responses: [{ kind: 'error', errorKind: 'unavailable' }] }),
        failedOnce,
      );
      await expect(check(new StubProvider(), failedOnce)).rejects.toMatchObject({
        reason: 'already_checked',
      });

      const unexplained = await rolled({ actionText: undefined });
      await expect(check(new StubProvider(), unexplained)).rejects.toMatchObject({
        reason: 'no_action',
      });

      const suggestion = await ask(
        new StubProvider({ responses: [{ kind: 'structured', value: gatherInformation }] }),
      );
      if (!suggestion.ok) throw new Error('expected a suggestion');
      const fromSuggestion = await rolled({
        moveId: 'move:adventure/gather-information',
        actionText: ACTION,
        suggestionEventId: suggestion.eventId,
      });
      await expect(check(new StubProvider(), fromSuggestion)).rejects.toMatchObject({
        reason: 'suggested',
      });

      await expect(check(new StubProvider(), newId<CommandId>())).rejects.toBeInstanceOf(
        AiRequestRefusedError,
      );
    });
  });

  describe('"What now?" (9.3, D-148)', () => {
    const suggestion = (
      character: string,
      actionText: string,
      moveId: string | null,
      anchors: string[],
    ) => ({
      character,
      actionText,
      moveId,
      reason: 'It matters now.',
      anchors,
    });
    const THREE: StubResponse = {
      kind: 'structured',
      value: {
        suggestions: [
          suggestion(
            'Vesna',
            "Vesna traces the power draw with the Lantern Wake's sensors.",
            'move:adventure/gather-information',
            ['A1'],
          ),
          suggestion(
            'Rook',
            'Rook secures the airlock before anyone goes deeper.',
            'move:adventure/secure-an-advantage',
            ['A1', 'A1'],
          ),
          suggestion(
            'Juno',
            'The crew pushes toward the station core.',
            'move:exploration/undertake-an-expedition',
            ['A5'],
          ),
        ],
      },
    };

    it('anchors the Guide in current state: the scene, the crew, the vow and the open threads', async () => {
      const events = await readEvents(db.sql, campaignId);
      const anchors = whatNowAnchors(project(events), events).map((a) => `${a.key} ${a.text}`);
      expect(anchors[0]).toBe('A1 The scene: The derelict relay station, at Varga Relay.');
      expect(anchors.some((a) => /^A\d+ Rook: health 5/.test(a))).toBe(true);
      expect(anchors.some((a) => a.includes('Vow (formidable) "Recover the flight recorder'))).toBe(
        true,
      );
      expect(anchors).toContain(
        `A${anchors.length} Left open last session: One row of windows on Varga Relay is lit.`,
      );
    });

    it('records three suggestions with their characters, any move, and the anchors they cite', async () => {
      const ai = new StubProvider({ responses: [THREE] });
      const commandId = newId<CommandId>();
      const result = await suggestActions(db.sql, ai, { campaignId, commandId, actor: PLAYER });

      expect(ai.requests.map((r) => r.purpose)).toEqual(['what_now']);
      expect(ai.requests[0]?.user).toMatch(/\[A1\] The scene: The derelict relay station/);
      if (!result.ok) throw new Error(result.message);
      expect(result.suggestions.map((s) => s.characterId)).toEqual([
        byCallsign('Vesna'),
        rook,
        juno,
      ]);
      // A Reference move may be named (D-148).
      expect(result.suggestions[2]?.moveId).toBe('move:exploration/undertake-an-expedition');
      // Anchors are recorded as text, each once.
      expect(result.suggestions[1]?.anchors).toEqual([
        'The scene: The derelict relay station, at Varga Relay.',
      ]);

      const events = await readEvents(db.sql, campaignId);
      const written = events.filter((e) => e.commandId === commandId);
      expect(written.map((e) => e.type)).toEqual(['ai.completed', 'actions.suggested']);
      expect(written[1]?.sessionId).toBe(project(events).session?.id);

      const replay = await suggestActions(db.sql, new StubProvider(), {
        campaignId,
        commandId,
        actor: PLAYER,
      });
      expect(replay).toEqual(result);
    });

    it('re-asks an answer that cites no anchor or repeats itself, then records the failure', async () => {
      const bad: StubResponse = {
        kind: 'structured',
        value: {
          suggestions: [
            suggestion('Vesna', 'Vesna scans.', null, []),
            suggestion('Vesna', 'Vesna scans.', null, ['A1']),
            suggestion('Rook', 'Rook waits.', null, ['A1']),
          ],
        },
      };
      const ai = new StubProvider({ responses: [bad, bad] });
      const result = await suggestActions(db.sql, ai, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
      });

      expect(result.ok).toBe(false);
      expect(ai.requests).toHaveLength(2);
      expect(ai.requests[1]?.user).toMatch(/cites no anchor/);
      expect(ai.requests[1]?.user).toMatch(/repeats another suggestion/);
    });

    it('refuses outside an open session', async () => {
      const db2 = await createTestDatabase('what_now_no_session');
      try {
        await seedFixture(db2.sql, SESSION_ONE);
        await expect(
          suggestActions(db2.sql, new StubProvider(), {
            campaignId: SESSION_ONE_CAMPAIGN_ID,
            commandId: newId(),
            actor: PLAYER,
          }),
        ).rejects.toMatchObject({ reason: 'no_session' });
      } finally {
        await db2.close();
      }
    });
  });
});
