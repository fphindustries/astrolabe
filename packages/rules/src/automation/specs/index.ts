import type { MoveAutomation } from '../../schema/automation.js';
import type { MoveId } from '../../schema/ids.js';

import { askTheOracle } from './ask-the-oracle.js';
import { beginASession } from './begin-a-session.js';
import { endASession } from './end-a-session.js';
import { endureHarm } from './endure-harm.js';
import { faceDanger } from './face-danger.js';
import { gatherInformation } from './gather-information.js';
import { payThePrice } from './pay-the-price.js';
import { reachAMilestone } from './reach-a-milestone.js';
import { secureAnAdvantage } from './secure-an-advantage.js';
import { swearAnIronVow } from './swear-an-iron-vow.js';

/**
 * The automation specs for exactly the moves D-59 scopes Milestone 1 to.
 * Aid Your Ally is not here — it's a flag on a MoveInvocation (D-62), not
 * its own spec. Every move not in this map stays at Reference.
 */
export const MOVE_AUTOMATION_SPECS: ReadonlyMap<MoveId, MoveAutomation> = new Map(
  [
    askTheOracle,
    beginASession,
    endASession,
    endureHarm,
    faceDanger,
    gatherInformation,
    payThePrice,
    reachAMilestone,
    secureAnAdvantage,
    swearAnIronVow,
  ].map((spec) => [spec.moveId, spec]),
);

export {
  askTheOracle,
  beginASession,
  endASession,
  endureHarm,
  faceDanger,
  gatherInformation,
  payThePrice,
  reachAMilestone,
  secureAnAdvantage,
  swearAnIronVow,
};
