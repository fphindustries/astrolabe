import type { AuthorityRule, PayloadFor } from './events/index.js';

/**
 * The reason a withdrawal gives, in words (D-128, amended): one function,
 * so the streamed `withdrawn` frame and the log entry say the same thing.
 */

type Violation = PayloadFor<'narration.withdrawn'>['violations'][number];

const PHRASES: Readonly<Record<Exclude<AuthorityRule, 'segment_check'>, (who: string) => string>> =
  {
    undeclared_action: (who) => `it had ${who} do something the player didn’t declare`,
    player_interior: (who) =>
      `it said what ${who} thinks, feels or characteristically does, which is the player’s to decide`,
    voice: (who) => `it gave ${who} words or expression that this latitude doesn’t allow`,
    injury: (who) => `it described an injury to ${who} other than the one established`,
    unchecked: () => 'it could not be checked, and an unchecked passage is never kept',
  };

export function withdrawalReason(violations: readonly Violation[]): string {
  const [first, ...rest] = violations;
  if (first === undefined) {
    return 'Withdrawn.';
  }
  const phrase =
    first.rule === 'segment_check'
      ? lowerFirst(first.why.replace(/\.$/u, ''))
      : PHRASES[first.rule](first.character ?? 'a player character');
  const more =
    rest.length === 0
      ? ''
      : `, and ${rest.length} more ${rest.length === 1 ? 'problem' : 'problems'}`;
  return `Withdrawn: ${phrase}${more}.`;
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1);
}
