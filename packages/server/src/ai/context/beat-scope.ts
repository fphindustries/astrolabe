import type { AstrolabeEvent, CommandId, EventId } from '@astrolabe/shared';

import { causalCommands } from '../../projection/cascade.js';
import { computeVoidState, isSuppressed } from '../../projection/void-state.js';

/**
 * Which events one passage of narration covers (D-110).
 *
 * The client names the commandId it just finished — the last step of a
 * move flow. That step may be deep in a chain (Face Danger's miss → Pay the
 * Price → Endure Harm), and the passage should narrate the whole chain,
 * not only its last link. So the scope walks `causedBy` up to the move that
 * started it, then takes that move's full causal subtree: every choice,
 * burn and chained move it led to, and nothing it didn't.
 *
 * `causedBy` for the passage is the latest live event in that subtree,
 * which is what makes voiding any part of the chain void the narration too
 * (D-83) — and it is computed here, never taken from a client.
 */

export type BeatScopeRefusal =
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_a_move'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'voided'; readonly detail: string }
  | {
      readonly ok: false;
      readonly reason: 'already_narrated';
      readonly detail: string;
      readonly narrationEventId: EventId;
    };

export interface BeatScope {
  readonly ok: true;
  readonly rootCommandId: CommandId;
  /** The live events of the chain, in log order. Accounting and narration events are excluded. */
  readonly events: readonly AstrolabeEvent[];
  /** The passage's `causedBy`. */
  readonly causedBy: EventId;
}

export interface BeatScopeOptions {
  /**
   * Resolve a chain that already has its passage. Narrating one refuses it;
   * rewriting that passage (task 7.9) or judging from its fiction (D-118)
   * needs exactly that chain.
   */
  readonly allowNarrated?: boolean;
}

export function resolveBeatScope(
  events: readonly AstrolabeEvent[],
  commandId: CommandId,
  options: BeatScopeOptions = {},
): BeatScope | BeatScopeRefusal {
  const byId = new Map(events.map((event) => [event.id, event]));
  const voids = computeVoidState(events);

  const named = events.filter((event) => event.commandId === commandId);
  if (named.length === 0) {
    return { ok: false, reason: 'not_found', detail: `No command ${commandId} in this campaign.` };
  }
  if (named.every((event) => isSuppressed(event, voids))) {
    return { ok: false, reason: 'voided', detail: 'That move has been voided.' };
  }

  // Walk up to the move that started the chain. Guarded against a cycle,
  // which the store cannot produce but which would otherwise hang here.
  let rootCommandId = commandId;
  const seen = new Set<CommandId>();
  for (;;) {
    seen.add(rootCommandId);
    const parentId = events.find(
      (e) => e.commandId === rootCommandId && e.causedBy !== null,
    )?.causedBy;
    const parent = parentId === null || parentId === undefined ? undefined : byId.get(parentId);
    if (parent === undefined || seen.has(parent.commandId)) {
      break;
    }
    rootCommandId = parent.commandId;
  }

  const rootEvents = events.filter((event) => event.commandId === rootCommandId);
  if (!rootEvents.some((event) => event.type === 'move.invoked')) {
    return {
      ok: false,
      reason: 'not_a_move',
      detail: 'Narration follows a move; that command did not invoke one.',
    };
  }
  if (rootEvents.every((event) => isSuppressed(event, voids))) {
    return {
      ok: false,
      reason: 'voided',
      detail: 'The move that started this chain has been voided.',
    };
  }

  const commands = causalCommands(events, rootCommandId);
  const inScope = events.filter(
    (event) => commands.has(event.commandId) && !isSuppressed(event, voids),
  );

  const narration = inScope.find((event) => event.type === 'narration.written');
  if (narration !== undefined && options.allowNarrated !== true) {
    return {
      ok: false,
      reason: 'already_narrated',
      detail: 'That move has already been narrated.',
      narrationEventId: narration.id,
    };
  }

  const chain = inScope.filter(
    (event) =>
      event.type !== 'ai.completed' &&
      event.type !== 'ai.failed' &&
      event.type !== 'narration.written' &&
      event.type !== 'narration.correction_requested' &&
      event.type !== 'narration.revised' &&
      // D-136: a remark on the beat, not part of what happened in it.
      event.type !== 'move.trigger_noted',
  );
  const latest = chain.at(-1);
  if (latest === undefined) {
    return { ok: false, reason: 'voided', detail: 'Nothing in that chain still stands.' };
  }

  return { ok: true, rootCommandId, events: chain, causedBy: latest.id };
}
