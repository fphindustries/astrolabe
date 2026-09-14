import type { CampaignSettings } from '@astrolabe/shared';

/**
 * The authority rubric (D-129): what belongs to the player, stated once.
 *
 * The Guide's standing prompt and D-128's checker read these same words,
 * so the narrator and the judge can't disagree about where the line is.
 * The boundary for a player-owned interior is duration, not observability:
 * a sensation in this beat arising from something committed is the world
 * acting on the character; anything that reaches beyond the beat — a
 * disposition, a history, a value, a characteristic response — is the
 * player's. Invented history is that same rule, not a second one.
 *
 * The examples are the ones D-129 records, all from round 20's passage.
 * Nothing from the later recorded violations is quoted here: the eval
 * (`npm run eval:authority`) grades the checker on those, and quoting them
 * in the rubric would let it pass by recognition rather than by the rule.
 */

export type AuthorityRuleId = 'undeclared_action' | 'player_interior' | 'voice' | 'injury';

export const AUTHORITY_RULES: Readonly<Record<AuthorityRuleId, string>> = {
  undeclared_action:
    'Undeclared action: a player character does only what the player declared: no further step, no move to a new place, no deliberate reaction. ' +
    'With nothing declared, the character does nothing; narrate what happens to them and around them. ' +
    'End where the resolved outcome ends. This holds in every sentence however it is framed: an action inside a line of speech, ' +
    'or inside a description of what happens to the character, is still an action ("steps sideways through the gap").',
  player_interior:
    "Player-owned interior: a player character's thoughts, emotions, intent and motivation belong to the player. " +
    'A sensation in this beat, arising from something already committed, is the world acting on the character and is allowed ' +
    '("a bright hot line through the undersuit", "the arm still closes"). ' +
    'Forbidden is any claim that reaches beyond this beat: a disposition, a history, a value, or how the character characteristically responds ' +
    '("folded and stowed the way everything has been folded and stowed for thirty years", "that is the whole of what matters").',
  voice:
    "Voice: a player character's spoken lines and outward expression (a grimace, a steadied voice) belong to Full voice latitude only, " +
    'and even there never commit the character to a choice the player has not made.',
  injury:
    "Established injury: when the beat states the injury as the Guide established it, the passage's injury to that character is that injury, " +
    'at the severity the player set, and not a different wound.',
};

/** The three rules the Guide writes under (D-129); the injury rule is already a fact of the beat (D-130). */
export const NARRATOR_RULES: readonly AuthorityRuleId[] = [
  'undeclared_action',
  'player_interior',
  'voice',
];

export function rubricText(rules: readonly AuthorityRuleId[]): string {
  return rules.map((rule) => `- ${AUTHORITY_RULES[rule]}`).join('\n');
}

/** Which voice the campaign's latitude allows, in the checker's words. */
export function latitudeVoice(latitude: CampaignSettings['narrationLatitude']): string {
  return latitude === 'full_voice'
    ? "Latitude: FULL VOICE. A player character's spoken lines and outward expression are allowed where they fit the declared action."
    : `Latitude: ${latitude === 'color' ? 'COLOR' : 'MINIMAL'}. A player character's spoken lines and outward expression are not allowed.`;
}
