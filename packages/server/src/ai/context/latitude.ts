import type { CampaignSettings } from '@astrolabe/shared';

/**
 * Narration latitude, enforced in the prompt (task 7.6, D-07, D-114).
 *
 * Each setting widens what the Guide may *describe*, never what it may
 * *decide*. The floor under all three is the authority model (§3): no
 * setting lets the AI narrate a character's thoughts or feelings, or choose
 * anything for them. That floor is stated in the shared system rules
 * (`prompt.ts`); these blocks state only what differs.
 *
 * A setting's block is fixed text, so a campaign's system prompt is
 * byte-stable from call to call and caches.
 */
export const LATITUDE_INSTRUCTIONS: Readonly<
  Record<CampaignSettings['narrationLatitude'], string>
> = {
  minimal: [
    'Narration latitude: MINIMAL.',
    'State what happens as a result of the declared action and the resolved outcome, plainly.',
    'Add no stylistic embellishment, no sensory flourish, and no dialogue.',
  ].join('\n'),
  color: [
    'Narration latitude: COLOR.',
    'Add style and sensory detail to the declared action: how it looks, sounds and feels in the world.',
    'Never voice a player character: no dialogue from them, no thoughts, no feelings.',
    'Non-player characters and the world may speak and act.',
  ].join('\n'),
  full_voice: [
    'Narration latitude: FULL VOICE.',
    'Add style and sensory detail to the declared action.',
    'You may also voice what a player character says aloud, and their outward expression — a grimace, a steadied voice — where it fits the declared action.',
    'Never narrate what a player character thinks or feels inside, and never have them say anything that commits them to a choice the player has not made.',
  ].join('\n'),
};
