import { describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import type { EntityId, EventId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  EMPTY_SECTOR_TROUBLE,
  applySectorTroubleRoll,
  initialSectorTrouble,
  setSectorTroubleText,
  takeSectorTroubleProposal,
  toSectorTroubleRequest,
  toTroublesDraft,
} from './troubles-form.js';

/** 8.5: the Troubles half of Connection and Troubles (D-194). */

const id = (n: number) => `0190f000-0000-7000-8000-00000000000${n}` as EventId;
const TROUBLE = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const accepted = (seq: number) => ({
  [TROUBLE]: {
    kind: 'sector' as const,
    troubleId: TROUBLE,
    text: 'A blockade chokes trade.',
    provenance: 'guide_proposal' as const,
    groundedIn: [id(1)],
    eventId: id(2),
    seq,
  },
});

describe('the sector trouble (8.5)', () => {
  it('opens on the accepted trouble with its roll, or on a newer draft', () => {
    expect(initialSectorTrouble(emptyCampaignState({ troubles: accepted(3) }))).toEqual({
      text: 'A blockade chokes trade.',
      rolls: [id(1)],
    });
    const drafted = emptyCampaignState({
      troubles: accepted(3),
      drafts: {
        connection_troubles: {
          seq: 4,
          snapshot: { troubles: [{ kind: 'sector', text: 'A drafted trouble.' }] },
        },
      },
    });
    expect(initialSectorTrouble(drafted).text).toBe('A drafted trouble.');
  });

  it('keeps the roll as grounding, and names the Guide’s reading once taken', () => {
    const rolled = applySectorTroubleRoll(EMPTY_SECTOR_TROUBLE, [
      { slot: 'trouble', eventId: id(1), text: 'Blockade prevents trade with other sectors' },
    ]);
    const taken = takeSectorTroubleProposal(rolled, {
      eventId: id(9),
      text: 'The Kronos blockade tightens.',
    });
    expect(toSectorTroubleRequest(taken)).toEqual({
      trouble: { kind: 'sector', text: 'The Kronos blockade tightens.' },
      proposalEventId: id(9),
      groundedIn: [id(1)],
    });
    expect(toSectorTroubleRequest(setSectorTroubleText(EMPTY_SECTOR_TROUBLE, '  '))).toBeNull();
  });

  it('reads a trouble row that embeds other tables whole, citing every roll (8.5)', () => {
    const rolled = applySectorTroubleRoll(EMPTY_SECTOR_TROUBLE, [
      { slot: 'trouble', eventId: id(1), text: 'Deliver' },
      { slot: 'trouble', eventId: id(2), text: 'Discovery' },
    ]);
    expect(rolled).toEqual({ text: 'Deliver + Discovery', rolls: [id(1), id(2)] });
  });

  it('saves the troubles without erasing a connection drafted on the other half', () => {
    const connection = {
      npcName: 'Juno Marr',
      participants: ['aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId],
    };
    const state = emptyCampaignState({
      drafts: {
        connection_troubles: {
          seq: 4,
          snapshot: { connection, troubles: [{ kind: 'sector', text: 'Old words.' }] },
        },
      },
    });

    expect(toTroublesDraft(state, { text: 'New words.', rolls: [] })).toEqual({
      connection,
      troubles: [{ kind: 'sector', text: 'New words.' }],
    });
  });
});
