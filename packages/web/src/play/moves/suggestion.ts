import type { Move } from '@astrolabe/rules';
import type { EventId, PayloadFor } from '@astrolabe/shared';

/**
 * The AI move suggestion (task 7.12, D-135) as the composer shows it. Pure,
 * so the panels stay thin bindings.
 */

export type MoveSuggestion = PayloadFor<'move.suggested'>;
export type SuggestedRollOption = NonNullable<MoveSuggestion['rollOption']>;

/**
 * What opening the composer carries over: the words the player already
 * typed, and — when it came from the Guide — the suggestion's roll option
 * and the suggestion itself, which the invocation will name.
 */
export interface ComposerPrefill {
  readonly actionText?: string;
  readonly rollOption?: SuggestedRollOption;
  readonly suggestion?: { readonly eventId: EventId; readonly payload: MoveSuggestion };
}

/** The roll option's key as `MoveComposer` keys its radio buttons. */
export function rollOptionKey(option: SuggestedRollOption): string {
  return option.using === 'stat' ? `stat:${option.stat}` : `condition_meter:${option.meter}`;
}

/** "Gather Information +wits", or just the move's name when there is no option. */
export function suggestionHeadline(
  suggestion: MoveSuggestion,
  moves: readonly Pick<Move, 'id' | 'name'>[],
): string | undefined {
  if (suggestion.moveId === null) {
    return undefined;
  }
  const name = moves.find((move) => move.id === suggestion.moveId)?.name ?? suggestion.moveId;
  const option = suggestion.rollOption;
  return option === undefined
    ? name
    : `${name} +${option.using === 'stat' ? option.stat : option.meter}`;
}

export function confidenceLabel(confidence: MoveSuggestion['confidence']): string {
  return `${confidence[0]?.toUpperCase() ?? ''}${confidence.slice(1)} confidence`;
}

/**
 * A suggestion answers the words it was asked about. Once the player has
 * changed them, it no longer does, and the card goes rather than fill the
 * composer with an answer to a different question.
 */
export function answersCurrentText(suggestion: MoveSuggestion, typed: string): boolean {
  return suggestion.actionText === typed.trim();
}

/** What picking a move by hand carries into the composer: only the player's own words. */
export function handPickPrefill(typed: string): ComposerPrefill {
  const actionText = typed.trim();
  return actionText.length > 0 ? { actionText } : {};
}

/** What using a suggestion carries into the composer. */
export function suggestionPrefill(eventId: EventId, suggestion: MoveSuggestion): ComposerPrefill {
  return {
    actionText: suggestion.actionText,
    ...(suggestion.rollOption !== undefined ? { rollOption: suggestion.rollOption } : {}),
    suggestion: { eventId, payload: suggestion },
  };
}
