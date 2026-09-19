import { CHARACTER_CREATION, type CharacterCreationRules } from './creation-rules.js';

/**
 * M2 crew creation has one campaign-shared ship, never a character grant.
 * Since 7.3 retired the Milestone 1 grant the two rule sets are the same;
 * the name stays so the launch validator says which rules it applies.
 */
export const CAMPAIGN_LAUNCH_CHARACTER_CREATION: CharacterCreationRules = CHARACTER_CREATION;
