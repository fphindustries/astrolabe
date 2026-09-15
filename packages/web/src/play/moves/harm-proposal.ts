import type { ProposeAmountResponse } from '@astrolabe/shared';

type Proposal = Extract<ProposeAmountResponse, { ok: true }>;

/**
 * What the harm intake says about the Guide's proposal (D-118, D-130):
 * the amount, the injury it establishes, and why that severity. The injury
 * stands whatever the player commits, so an adjusted amount is noted beside
 * it rather than replacing it.
 */
export function proposalText(proposal: Proposal, committed: number, edited: boolean): string {
  const fiction =
    proposal.injury === undefined ? proposal.reason : `${proposal.injury} (${proposal.reason})`;
  const adjusted = edited && committed !== proposal.amount ? ` You set ${committed}.` : '';
  return `The Guide proposes ${proposal.amount}: ${fiction}${adjusted}`;
}
