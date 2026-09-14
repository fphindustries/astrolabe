import { MOVE_AUTOMATION_SPECS, STARFORGED, type MoveId, type OutcomeTier } from '@astrolabe/rules';
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
 */

export interface BeatFacts {
  readonly lines: readonly string[];
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
  const lines: string[] = [];
  const liveProposal = proposalLookup(log);
  const finalTier = new Map<string, OutcomeTier>();
  let match = false;
  let burned = false;
  let chainedToSuffer = false;

  const who = (id: string | undefined): string =>
    id === undefined ? 'The crew' : (state.characters[id as never]?.callsign ?? 'A crew member');

  for (const event of events) {
    switch (event.type) {
      case 'move.invoked': {
        const p = event.payload;
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
        lines.push(
          `${who(p.actorCharacterId)} makes the move ${moveName(p.moveId)}${using}${aiding}.`,
        );
        if (p.actionText !== undefined && p.actionText.trim().length > 0) {
          lines.push(`The player declared: "${p.actionText.trim()}"`);
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
          lines.push(
            `Roll: action die ${p.actionDie}${adds.length > 0 ? ` ${adds}` : ''} = ${p.actionScore}, ` +
              `against challenge dice ${p.challengeDice[0]} and ${p.challengeDice[1]}: ` +
              `${TIER_WORDS[p.tier]}${matchNote}.`,
          );
        } else {
          lines.push(
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
        lines.push(
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
        lines.push(
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
        lines.push(`For ${moveName(p.moveId)}, the player chose: ${label}.`);
        break;
      }
      case 'oracle.rolled':
        lines.push(`Oracle result (${event.payload.roll}): ${event.payload.rowText}`);
        break;
      case 'move.chained': {
        const p = event.payload;
        const to = STARFORGED.moves.find((m) => m.id === p.toMoveId);
        chainedToSuffer ||= to?.category === 'suffer';
        lines.push(`This leads to ${moveName(p.toMoveId)}.`);
        break;
      }
      case 'amount.committed': {
        const p = event.payload;
        lines.push(
          `The player set the ${p.meter} loss at ${Math.abs(p.amount)} for ${who(p.characterId)}.`,
        );
        const proposal =
          p.proposalEventId === undefined ? undefined : liveProposal(p.proposalEventId);
        if (proposal?.injury !== undefined) {
          lines.push(`The injury, as the Guide established it: ${proposal.injury}`);
          if (Math.abs(proposal.amount) !== Math.abs(p.amount)) {
            const direction =
              Math.abs(p.amount) < Math.abs(proposal.amount) ? 'milder' : 'more severe';
            lines.push(
              `The player judged it ${direction} than the Guide's proposed ${Math.abs(proposal.amount)}: ` +
                'narrate that injury at the severity the player set.',
            );
          }
        }
        break;
      }
      case 'state.changed':
        for (const { delta } of event.payload.changes) {
          lines.push(describeDelta(delta, who));
        }
        break;
      case 'track.advanced': {
        const track = state.tracks[event.payload.trackId];
        lines.push(`"${track?.title ?? 'A track'}" advances by ${event.payload.ticks}.`);
        break;
      }
      case 'state.overridden':
      case 'amount.proposed':
      default:
        break;
    }
  }

  return {
    lines,
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
