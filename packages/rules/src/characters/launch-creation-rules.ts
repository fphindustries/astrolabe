import { CHARACTER_CREATION, type CharacterCreationRules } from './creation-rules.js';

/** M2 crew creation has one campaign-shared ship, never a character grant. */
export const CAMPAIGN_LAUNCH_CHARACTER_CREATION: CharacterCreationRules = {
  ...CHARACTER_CREATION,
  grants: [],
};
