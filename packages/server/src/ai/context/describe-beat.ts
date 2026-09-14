import {
  MOVE_AUTOMATION_SPECS,
  STARFORGED,
  type CharacterId,
  type MoveId,
  type OutcomeTier,
} from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState, Delta, EventId, PayloadFor } from '@astrolabe/shared';

import { computeVoidState, isSuppressed } from '../../projection/void-state.js';

/**
 * A beat's resolved mechanics as plain statements the AI narrates from
 * (task 7.4).
 *
 * Everything here is *already decided*: the move the player chose, the
 * words they declared, the dice, the choices they made, the harm they
 * committed, the deltas the rules engine applied. The AI's job is to give
 * those facts narrative depth, never to revisit them — so they are stated
 * as facts, and nothing a player owns (thoughts, feelings, intent beyond
 * the declared action) appears here, because none of it is stored.
 *
 * Built from the events of one beat scope (`beat-scope.ts`), in log order.
 * An AI-proposed *amount* and its severity reason are left out on purpose:
 * the passage follows the amount the player committed (Beat 7), and naming
 * the proposal's number would invite the prose to follow the wrong one. The
 * proposal's *injury* is carried (D-130). It was established once, and the
 * passage narrates that wound at the committed severity rather than
 * inventing another. The injury is found through the committed amount's
 * `proposalEventId` in the whole `log`, because a standalone suffer move's
 * proposal sits outside the beat's causal scope.
 *
 * Every fact has a key, a kind, the character it is about and the event it
 * came from (D-127). Segments cite facts by key, and the checks that need no
 * AI read the kind and character: a `character_does` segment has to cite a
 * declared action by that character.
 */

/**
 * D-127's kinds, plus `move` for which move was made and what it chained
 * into. An oracle result is a `roll`; a momentum burn is an `effect`.
 */
export type FactKind =
  | 'move'
  | 'declared_action'
  | 'roll'
  | 'choice'
  | 'effect'
  | 'injury'
  /** D-141: the scene a frame opens. */
  | 'scene'
  /** D-138: an entity a world pass established. */
  | 'entity';

export interface BeatFact {
  /** `F1`, `F2`, … in log order: what a segment's `basis` cites. */
  readonly key: string;
  readonly kind: FactKind;
  /** The player character the fact is about, if any. */
  readonly characterId?: CharacterId;
  readonly eventId: EventId;
  readonly text: string;
  /**
   * The oracle rolls behind the fact (8.2): a passage citing it is grounded
   * in them, and they become its chips. A roll fact is grounded in itself;
   * an entity in the rolls it was built from.
   */
  readonly grounds?: readonly EventId[];
}

export interface BeatFacts {
  readonly facts: readonly BeatFact[];
  /** The facts' text alone, for prompts that don't cite them. */
  readonly lines: readonly string[];
  /** Whether the player declared an action anywhere in the beat (D-115's routine cap). */
  readonly declaredAction: boolean;
  /** D-115's dramatic-weight signals. */
  readonly miss: boolean;
  readonly match: boolean;
  readonly burned: boolean;
  readonly chainedToSuffer: boolean;
}

const TIER_WORDS: Record<OutcomeTier, string> = {
  strong_hit: 'a strong hit',
  weak_hit: 'a weak hit',
  miss: 'a miss',
};

export function describeBeat(
  events: readonly AstrolabeEvent[],
  state: CampaignState,
  log: readonly AstrolabeEvent[],
): BeatFacts {
  const facts: BeatFact[] = [];
  const liveProposal = proposalLookup(log);
  const finalTier = new Map<string, OutcomeTier>();
  let match = false;
  let burned = false;
  let chainedToSuffer = false;
  let declaredAction = false;
  // Rolls and choices carry no character of their own: they belong to the
  // move being resolved, which is the latest one invoked.
  let mover: CharacterId | undefined;

  const who = (id: string | undefined): string =>
    id === undefined ? 'The crew' : (state.characters[id as never]?.callsign ?? 'A crew member');

  let event: AstrolabeEvent;
  const push = (
    kind: FactKind,
    characterId: CharacterId | undefined,
    text: string,
    grounds?: readonly EventId[],
  ): void => {
    facts.push({
      key: `F${facts.length + 1}`,
      kind,
      ...(characterId !== undefined ? { characterId } : {}),
      eventId: event.id,
      text,
      ...(grounds !== undefined ? { grounds } : {}),
    });
  };

  for (event of events) {
    switch (event.type) {
      case 'move.invoked': {
        const p = event.payload;
        mover = p.actorCharacterId;
        const using =
          p.using === undefined
            ? ''
            : p.using.using === 'stat'
              ? ` with ${p.using.stat}`
              : p.using.using === 'condition_meter'
                ? ` with ${p.using.meter}`
                : '';
        const aiding =
          p.aidingAllyId === undefined ? '' : `, in direct support of ${who(p.aidingAllyId)}`;
        push(
          'move',
          p.actorCharacterId,
          `${who(p.actorCharacterId)} makes the move ${moveName(p.moveId)}${using}${aiding}.`,
        );
        if (p.actionText !== undefined && p.actionText.trim().length > 0) {
          declaredAction = true;
          push(
            'declared_action',
            p.actorCharacterId,
            `The player declared: "${p.actionText.trim()}"`,
          );
        }
        break;
      }
      case 'dice.rolled': {
        const p = event.payload;
        finalTier.set(event.id, p.tier);
        match ||= p.isMatch;
        const matchNote = p.isMatch ? ', and the challenge dice match' : '';
        if (p.kind === 'action') {
          const adds = p.adds.map((a) => `${signed(a.amount)} ${a.label}`).join(' ');
          push(
            'roll',
            mover,
            `Roll: action die ${p.actionDie}${adds.length > 0 ? ` ${adds}` : ''} = ${p.actionScore}, ` +
              `against challenge dice ${p.challengeDice[0]} and ${p.challengeDice[1]}: ` +
              `${TIER_WORDS[p.tier]}${matchNote}.`,
          );
        } else {
          push(
            'roll',
            mover,
            `Progress roll: ${p.progressScore} against challenge dice ` +
              `${p.challengeDice[0]} and ${p.challengeDice[1]}: ${TIER_WORDS[p.tier]}${matchNote}.`,
          );
        }
        break;
      }
      case 'momentum.burned': {
        const p = event.payload;
        burned = true;
        finalTier.set(p.rollEventId, p.tierAfter);
        push(
          'effect',
          p.characterId,
          `${who(p.characterId)} burned momentum: the result is now ${TIER_WORDS[p.tierAfter]} ` +
            `(it was ${TIER_WORDS[p.tierBefore]}).`,
        );
        break;
      }
      case 'move.choice_made': {
        const p = event.payload;
        const choice = MOVE_AUTOMATION_SPECS.get(p.moveId)?.outcomes[p.tier]?.choices?.find(
          (c) => c.id === p.choiceId,
        );
        const labels = p.optionIds.map(
          (id) => choice?.options.find((o) => o.id === id)?.label ?? id,
        );
        push(
          'choice',
          mover,
          labels.length === 0
            ? 'The player chose none of the offered options.'
            : `The player chose: ${labels.join('; ')}.`,
        );
        break;
      }
      case 'move.method_chosen': {
        const p = event.payload;
        const label =
          MOVE_AUTOMATION_SPECS.get(p.moveId)?.method?.options.find((o) => o.id === p.optionId)
            ?.label ?? p.optionId;
        push('choice', mover, `For ${moveName(p.moveId)}, the player chose: ${label}.`);
        break;
      }
      case 'oracle.rolled':
        push('roll', undefined, `Oracle result (${event.payload.roll}): ${event.payload.rowText}`, [
          event.id,
        ]);
        break;
      case 'move.chained': {
        const p = event.payload;
        const to = STARFORGED.moves.find((m) => m.id === p.toMoveId);
        chainedToSuffer ||= to?.category === 'suffer';
        push('move', undefined, `This leads to ${moveName(p.toMoveId)}.`);
        break;
      }
      case 'amount.committed': {
        const p = event.payload;
        push(
          'effect',
          p.characterId,
          `The player set the ${p.meter} loss at ${Math.abs(p.amount)} for ${who(p.characterId)}.`,
        );
        const proposal =
          p.proposalEventId === undefined ? undefined : liveProposal(p.proposalEventId);
        if (proposal?.injury !== undefined) {
          push(
            'injury',
            p.characterId,
            `The injury, as the Guide established it: ${proposal.injury}`,
          );
          if (Math.abs(proposal.amount) !== Math.abs(p.amount)) {
            const direction =
              Math.abs(p.amount) < Math.abs(proposal.amount) ? 'milder' : 'more severe';
            push(
              'injury',
              p.characterId,
              `The player judged it ${direction} than the Guide's proposed ${Math.abs(proposal.amount)}: ` +
                'narrate that injury at the severity the player set.',
            );
          }
        }
        break;
      }
      case 'state.changed':
        for (const { delta } of event.payload.changes) {
          push('effect', delta.characterId, describeDelta(delta, who));
        }
        break;
      case 'track.advanced': {
        const track = state.tracks[event.payload.trackId];
        push(
          'effect',
          undefined,
          `"${track?.title ?? 'A track'}" advances by ${event.payload.ticks}.`,
        );
        break;
      }
      case 'state.overridden':
      case 'amount.proposed':
      default:
        break;
    }
  }

  return {
    facts,
    lines: facts.map((fact) => fact.text),
    declaredAction,
    miss: [...finalTier.values()].includes('miss'),
    match,
    burned,
    chainedToSuffer,
  };
}

/** A live `amount.proposed` payload by event id; a voided proposal establishes nothing. */
function proposalLookup(
  log: readonly AstrolabeEvent[],
): (id: EventId) => PayloadFor<'amount.proposed'> | undefined {
  const voids = computeVoidState(log);
  const proposals = new Map(
    log
      .filter((event) => event.type === 'amount.proposed' && !isSuppressed(event, voids))
      .map((event) => [event.id, event.payload as PayloadFor<'amount.proposed'>]),
  );
  return (id) => proposals.get(id);
}

function describeDelta(delta: Delta, who: (id: string | undefined) => string): string {
  switch (delta.kind) {
    case 'momentum':
      return `${who(delta.characterId)}: momentum ${signed(delta.delta)}.`;
    case 'momentum_reset':
      return `${who(delta.characterId)}: momentum resets.`;
    case 'meter':
      return `${who(delta.characterId)}: ${delta.meter} ${signed(delta.delta)}.`;
    case 'bonus_next_move':
      return `${who(delta.characterId)}: ${signed(delta.amount)} on their next move.`;
    case 'impact': {
      const label =
        STARFORGED.gameRules.impacts.find((i) => i.id === delta.impact)?.label ?? delta.impact;
      return `${who(delta.characterId)}: ${delta.set ? 'now' : 'no longer'} ${label.toLowerCase()}.`;
    }
  }
}

function moveName(id: MoveId): string {
  return STARFORGED.moves.find((move) => move.id === id)?.name ?? id;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
