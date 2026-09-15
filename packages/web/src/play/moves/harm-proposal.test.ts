import { describe, expect, it } from 'vitest';

import type { EventId } from '@astrolabe/shared';

import { proposalText } from './harm-proposal.js';

const PROPOSAL = {
  ok: true as const,
  eventId: 'aaaaaaaa-0000-4000-8000-000000000001' as EventId,
  amount: -2,
  injury: "A ruptured conduit sprays sparks across Rook's arm.",
  reason: 'A serious burn.',
};

describe('proposalText (D-118, D-130)', () => {
  it('shows the amount, the injury and why that severity', () => {
    expect(proposalText(PROPOSAL, -2, false)).toBe(
      "The Guide proposes -2: A ruptured conduit sprays sparks across Rook's arm. (A serious burn.)",
    );
  });

  it('keeps the injury when the player sets a different amount', () => {
    expect(proposalText(PROPOSAL, -1, true)).toBe(
      "The Guide proposes -2: A ruptured conduit sprays sparks across Rook's arm. (A serious burn.) You set -1.",
    );
  });

  it('falls back to the reason for a proposal with no injury', () => {
    const { injury: _injury, ...older } = PROPOSAL;
    expect(proposalText(older, -2, false)).toBe('The Guide proposes -2: A serious burn.');
  });
});
