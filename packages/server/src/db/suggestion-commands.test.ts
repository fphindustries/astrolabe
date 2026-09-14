import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CommandId, type EventId } from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import {
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { project } from '../projection/project.js';

import { readEvents } from './event-store.js';
import { MoveRejectedError, invokeMove } from './move-commands.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { suggestMove } from './suggestion-commands.js';
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

  beforeAll(async () => {
    db = await createTestDatabase('suggestions');
    await seedFixture(db.sql, SESSION_TWO_OPEN);
    const state = project(await readEvents(db.sql, campaignId));
    const byCallsign = (callsign: string) =>
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
});
