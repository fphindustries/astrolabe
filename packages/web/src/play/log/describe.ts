import { STARFORGED, withoutLinks } from '@astrolabe/rules';

import type { EntryBody } from './entries.js';

/**
 * How a log entry reads (tasks 5.4, 10.1): a short tag naming what kind of
 * thing happened, and its line in words. Rule ids resolve to the names a
 * player knows ("Face Danger", not `move:adventure/face-danger`).
 */

const TIER_WORDS: Readonly<Record<string, string>> = {
  strong_hit: 'Strong hit',
  weak_hit: 'Weak hit',
  miss: 'Miss',
};

const METHOD_WORDS: Readonly<Record<string, string>> = {
  obvious: 'Chose the obvious price',
  oracle: 'Asked the oracle for the price',
  table: 'Rolled on the table',
};

export function moveName(moveId: string): string {
  return STARFORGED.moves.find((move) => move.id === moveId)?.name ?? moveId;
}

export function tierWords(tier: string): string {
  return TIER_WORDS[tier] ?? tier.replace(/_/g, ' ');
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const words = (id: string) => id.replace(/[-_]/g, ' ');

/** The tag before an entry, or `undefined` for prose that stands on its own. */
export function entryTag(body: EntryBody): string | undefined {
  switch (body.kind) {
    case 'narration':
    case 'withdrawal':
    case 'trigger_note':
    case 'scene':
      return undefined;
    case 'move':
      return 'Move';
    case 'roll':
      return 'Roll';
    case 'burn':
      return 'Burn';
    case 'move_choice_made':
      return 'Choice';
    case 'move_method_chosen':
      return 'Price';
    case 'move_chained':
      return 'Chain';
    case 'oracle_rolled':
      return 'Oracle';
    case 'amount_proposed':
      return 'Guide';
    case 'amount_committed':
      return 'Harm';
    case 'complication_offered':
    case 'complication_set':
      return 'Complication';
    case 'track_created':
    case 'track_advanced':
      return 'Track';
    case 'entity_established':
      return 'New';
    case 'override':
      return 'Edited';
    case 'void':
      return 'Void';
    case 'session_ended':
      return 'Session';
    case 'unknown':
      return 'Event';
  }
}

/** The entry's line in words. */
export function entryText(body: EntryBody): string {
  switch (body.kind) {
    case 'scene':
      return body.title;
    case 'move':
      return `${moveName(body.moveId)}${body.aiding ? ', aiding an ally' : ''}`;
    case 'roll':
      return (
        `${tierWords(body.tier)}${body.isMatch ? ', a match' : ''}` +
        (body.burnOffered ? (body.burnTaken ? ' — momentum burned' : ' — burn offered') : '')
      );
    case 'burn':
      return `Momentum burned: ${tierWords(body.tierBefore)} → ${tierWords(body.tierAfter)}`;
    case 'move_choice_made':
      return body.optionIds.length === 0
        ? 'Declined the offered options'
        : `Chose ${body.optionIds.map(words).join(', ')}`;
    case 'move_method_chosen':
      return METHOD_WORDS[body.optionId] ?? words(body.optionId);
    case 'move_chained':
      return `${body.mode === 'auto' ? 'Leads to' : 'Offers'} ${moveName(body.toMoveId)} — ${body.reason}`;
    case 'oracle_rolled':
      return `${withoutLinks(body.rowText)} (${body.roll})`;
    case 'amount_proposed':
      return `Proposes ${signed(body.amount)} ${body.meter} — ${body.injury === undefined ? body.reason : `${body.injury} (${body.reason})`}`;
    case 'amount_committed':
      return `${signed(body.amount)} ${body.meter}`;
    case 'track_created':
      return `${body.title} created`;
    case 'complication_offered':
      return 'The Guide offers complications:';
    case 'complication_set':
      return `${body.text} (${
        body.source === 'offered'
          ? 'picked from the Guide’s options'
          : body.fromOffer
            ? 'edited from the Guide’s option'
            : 'written by the player'
      })`;
    case 'track_advanced':
      return `+${body.ticks}${body.reason === undefined ? '' : ` — ${body.reason}`}`;
    case 'entity_established':
      return `${body.name} established`;
    case 'narration':
      return body.text;
    case 'withdrawal':
      return body.reason;
    case 'trigger_note':
      return `The Guide notes the trigger may not fit: ${body.reason}`;
    case 'override':
      return `${body.from} → ${body.to}${body.reason === undefined ? '' : ` — ${body.reason}`}`;
    case 'void':
      return `${body.cascadedCount} event${body.cascadedCount === 1 ? '' : 's'} voided — ${body.reason}`;
    case 'session_ended':
      return body.summary;
    case 'unknown':
      return body.type;
  }
}
