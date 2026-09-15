import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import {
  EVENT_TYPE_META,
  type AstrolabeEvent,
  type CampaignSettings,
  type CampaignState,
  type EventId,
  type SessionId,
} from '@astrolabe/shared';

import { livePassages } from '../../projection/narrative-log.js';
import { computeVoidState, isSuppressed } from '../../projection/void-state.js';
import type { AiRequest } from '../provider.js';

import type { BeatFact, BeatFacts, FactKind } from './describe-beat.js';
import { narrationBudget } from './length.js';
import { systemBlocks } from './prompt.js';
import { renderState } from './render-state.js';
import { renderFacts, segmentContext, segmentInstructions } from './segments.js';

/**
 * The recap that opens a session (task 9.1, A1, D-12, D-72, D-147). Pure,
 * like the rest of this directory.
 *
 * Its facts are §10's recap read: the previous session's `session.ended`
 * summary and open threads, then that session's significant, non-voided
 * events in `seq` order. A recap retells what was declared and committed
 * then, so it is not world-only (D-141): a character acts in it only in a
 * segment citing that character's declared action from that session, which
 * `checkSegmentTags` already requires of a `declared_action` fact.
 */

/** The session a recap retells: the latest one that ended before `current`. */
export function previousSession(
  events: readonly AstrolabeEvent[],
  current: SessionId,
): { readonly sessionId: SessionId; readonly ended: EventId } | undefined {
  let last: { sessionId: SessionId; ended: EventId } | undefined;
  for (const event of events) {
    if (event.type === 'session.ended' && event.sessionId !== null && event.sessionId !== current) {
      last = { sessionId: event.sessionId, ended: event.id };
    }
  }
  return last;
}

export function describeRecap(
  events: readonly AstrolabeEvent[],
  state: CampaignState,
  sessionId: SessionId,
): BeatFacts {
  const voids = computeVoidState(events);
  const inSession = events.filter((e) => e.sessionId === sessionId && !isSuppressed(e, voids));
  const passages = new Map(livePassages(inSession).map((p) => [p.eventId, p.text]));
  const facts: BeatFact[] = [];
  let declaredAction = false;

  const who = (id: CharacterId | undefined): string =>
    id === undefined ? 'The crew' : (state.characters[id]?.callsign ?? 'A crew member');
  const push = (
    kind: FactKind,
    eventId: EventId,
    text: string,
    characterId?: CharacterId,
    grounds?: readonly EventId[],
  ): void => {
    facts.push({
      key: `F${facts.length + 1}`,
      kind,
      eventId,
      text,
      ...(characterId !== undefined ? { characterId } : {}),
      ...(grounds !== undefined && grounds.length > 0 ? { grounds } : {}),
    });
  };

  const ended = inSession.find((e) => e.type === 'session.ended');
  if (ended?.type === 'session.ended') {
    push('summary', ended.id, `Summary of the last session: ${ended.payload.summary}`);
    for (const thread of ended.payload.openThreads) {
      push('summary', ended.id, `Left open: ${thread}`);
    }
  }

  for (const event of inSession) {
    if (!EVENT_TYPE_META[event.type].significant) {
      continue;
    }
    switch (event.type) {
      case 'scene.started': {
        const location =
          event.payload.locationId === undefined
            ? undefined
            : state.entities[event.payload.locationId];
        push(
          'scene',
          event.id,
          `A scene: ${event.payload.title}${location === undefined ? '' : `, at ${location.name}`}.`,
        );
        break;
      }
      case 'move.invoked': {
        const p = event.payload;
        push(
          'move',
          event.id,
          `${who(p.actorCharacterId)} made the move ${moveName(p.moveId)}.`,
          p.actorCharacterId,
        );
        if (p.actionText !== undefined && p.actionText.trim().length > 0) {
          declaredAction = true;
          push(
            'declared_action',
            event.id,
            `The player declared: "${p.actionText.trim()}"`,
            p.actorCharacterId,
          );
        }
        break;
      }
      case 'complication.set':
        push('choice', event.id, `The player set a complication: ${event.payload.text}`);
        break;
      case 'entity.established': {
        const p = event.payload;
        if (p.kind === 'location') {
          // The sector is set up before any session; a location is state, not an event of play.
          break;
        }
        push(
          'entity',
          event.id,
          `Established: ${p.name}. ${Object.values(p.fields).join(' ')}`.trim(),
          undefined,
          p.provenance.groundedIn,
        );
        break;
      }
      case 'track.created':
        push('effect', event.id, `A ${event.payload.kind} began: "${event.payload.title}".`);
        break;
      case 'track.advanced': {
        const track = state.tracks[event.payload.trackId];
        push('effect', event.id, `"${track?.title ?? 'A track'}" advanced.`);
        break;
      }
      case 'narration.written': {
        const text = passages.get(event.id);
        if (text !== undefined && event.payload.role !== 'recap') {
          push('passage', event.id, `As it was narrated: ${text}`);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    facts,
    lines: facts.map((fact) => fact.text),
    declaredAction,
    miss: false,
    match: false,
    burned: false,
    chainedToSuffer: false,
  };
}

export function buildRecapRequest(
  state: CampaignState,
  facts: BeatFacts,
  settings: CampaignSettings,
): AiRequest {
  const ctx = segmentContext(facts, state, settings.narrationLatitude);
  // D-147: a recap is short, at the routine range.
  const budget = narrationBudget('routine', settings.narrationLength);
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<last_session>\n${renderFacts(ctx)}\n</last_session>`,
    segmentInstructions(ctx, facts.declaredAction),
    'A new session is beginning. Write a short "previously on…" recap of the last session from the facts above: what the crew did, what they found, and where it left them. ' +
      'A player character did only what a declared-action fact says, and nothing in the recap goes beyond those facts. ' +
      'Past tense. End where the last session ended, on what is still open, without suggesting what anyone should do next.',
    `Write ${budget.min} to ${budget.max} words.`,
  ].join('\n\n');
  return { purpose: 'recap', system: systemBlocks(settings), user, effort: 'low' };
}

function moveName(id: string): string {
  return STARFORGED.moves.find((m) => m.id === id)?.name ?? id;
}
