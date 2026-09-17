import { STARFORGED } from '@astrolabe/rules';
import type { EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import { emptyCampaignState } from './state-fixture.js';
import {
  acceptsProposal,
  heldProposal,
  isEditedProposal,
  proposalReference,
  proposalSelection,
  type HeldProposal,
  type TruthProposalPayload,
} from './truth-proposal.js';

/**
 * The Guide's recommendation for one truth (5.3).
 *
 * The property under test throughout is that a recommendation is held, not
 * applied (D-161): reading it changes nothing, accepting it is the ordinary
 * decide command, and the client says only *which* proposal it accepted.
 */

const EXODUS = STARFORGED.truths[1]!;
const PROPOSAL = 'aaaaaaaa-0000-4000-8000-000000000007' as EventId;

type TruthProposal = TruthProposalPayload['proposal'];

const stateWith = (proposal: TruthProposal) =>
  emptyCampaignState({
    proposals: {
      [EXODUS.id]: {
        targetKind: 'truth',
        targetId: EXODUS.id,
        rationale: 'It fits the premise.',
        groundedIn: [],
        eventId: PROPOSAL,
        proposal,
      },
    },
  });

describe('reading a held recommendation', () => {
  it('holds nothing when the Guide has not been asked', () => {
    expect(heldProposal(emptyCampaignState(), EXODUS.id)).toBeNull();
  });

  it('reads a recommended option from projected state, so a reload keeps it (A23)', () => {
    const held = heldProposal(
      stateWith({ truthId: EXODUS.id, resolution: 'selected', optionIndex: 1 }),
      EXODUS.id,
    );

    expect(held).toMatchObject({
      truthId: EXODUS.id,
      proposalEventId: PROPOSAL,
      resolution: 'selected',
      optionIndex: 1,
      rationale: 'It fits the premise.',
    });
  });

  it('holds nothing for a recommendation that named no option or words', () => {
    // The server re-asks for these, so one arriving means something changed
    // underneath. An empty panel would claim the Guide said something.
    expect(
      heldProposal(stateWith({ truthId: EXODUS.id, resolution: 'selected' }), EXODUS.id),
    ).toBeNull();
    expect(
      heldProposal(stateWith({ truthId: EXODUS.id, resolution: 'custom', text: '  ' }), EXODUS.id),
    ).toBeNull();
  });
});

describe('accepting, or not', () => {
  const selected: HeldProposal = {
    truthId: EXODUS.id,
    proposalEventId: PROPOSAL,
    resolution: 'selected',
    optionIndex: 1,
    rationale: 'It fits.',
  };
  const written: HeldProposal = {
    truthId: EXODUS.id,
    proposalEventId: PROPOSAL,
    resolution: 'custom',
    text: 'A fleet that never arrived.',
    rationale: 'Nothing established fits.',
  };

  it('turns a recommendation into the selection that accepts it unchanged', () => {
    expect(proposalSelection(selected)).toEqual({ resolution: 'selected', optionIndex: 1 });
    expect(isEditedProposal(selected, proposalSelection(selected))).toBe(false);
    expect(isEditedProposal(written, proposalSelection(written))).toBe(false);
  });

  it('knows the player changed it', () => {
    expect(isEditedProposal(selected, { resolution: 'selected', optionIndex: 2 })).toBe(true);
    expect(isEditedProposal(selected, { resolution: 'custom', text: 'Mine' })).toBe(true);
    expect(isEditedProposal(written, { resolution: 'custom', text: 'Something else' })).toBe(true);
  });

  it('treats whitespace around the Guide’s words as unchanged', () => {
    expect(
      isEditedProposal(written, { resolution: 'custom', text: '  A fleet that never arrived. ' }),
    ).toBe(false);
  });

  it('names the proposal only on a path that can accept one', () => {
    // The server refuses the other two by name, and it is right to: rolling is
    // not accepting a recommendation (the Guide never rolls), and leaving a
    // truth open is a decision the Guide cannot make for the player.
    expect(acceptsProposal({ resolution: 'rolled' })).toBe(false);
    expect(acceptsProposal({ resolution: 'leave_open' })).toBe(false);

    expect(proposalReference(selected, { resolution: 'selected', optionIndex: 1 })).toEqual({
      proposalEventId: PROPOSAL,
    });
    expect(proposalReference(selected, { resolution: 'rolled' })).toEqual({});
    expect(proposalReference(selected, { resolution: 'leave_open' })).toEqual({});
    expect(proposalReference(null, { resolution: 'selected', optionIndex: 1 })).toEqual({});
  });
});
