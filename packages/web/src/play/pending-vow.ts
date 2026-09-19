import type { CharacterId, MoveId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';

/**
 * The campaign's pending inciting vow as play offers it (9.4, D-201): Session
 * 1's first beat is the real `Swear an Iron Vow`, by the vow's roller, at
 * +heart. Offered while it is unsworn; gone once its track exists.
 */

export const SWEAR_AN_IRON_VOW = 'move:quest/swear-an-iron-vow' as MoveId;

export interface PendingVowView {
  readonly rollerId: CharacterId;
  readonly rollerName: string;
  readonly text: string;
  readonly rank: string;
  /** Those who share it besides the roller. */
  readonly sharedWith: readonly string[];
}

export function pendingVowView(state: CampaignState): PendingVowView | undefined {
  const activation = state.launch.activation;
  const incident = state.launch.incident;
  if (activation === undefined || activation.vowTrackId !== undefined || incident === undefined)
    return undefined;
  const vow = activation.pendingVow;
  const nameOf = (id: CharacterId) => state.characters[id]?.name ?? 'a crew member';
  return {
    rollerId: vow.rollerId,
    rollerName: nameOf(vow.rollerId),
    text: incident.text,
    rank: vow.rank,
    sharedWith: vow.participants.filter((id) => id !== vow.rollerId).map(nameOf),
  };
}
