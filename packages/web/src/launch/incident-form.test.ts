import { describe, expect, it } from 'vitest';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import type { CampaignState, EntityId, EventId } from '@astrolabe/shared';

import {
  EMPTY_INCIDENT_FORM,
  chooseOption,
  drawsOnNames,
  initialIncidentForm,
  setIncidentText,
  toIncidentDraft,
  toIncidentRequest,
  writeOwn,
  type IncidentOption,
} from './incident-form.js';
import { emptyCampaignState } from './state-fixture.js';

/** 9.2: the Incident half of Incident and Launch (beat 11, A37, D-200). */

const id = (n: number) => `0190f000-0000-7000-8000-00000000000${n}` as EventId;
const VESNA = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const EMBER = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const CONNECTION = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const truth = STARFORGED.truths[0]!;

const OPTION: IncidentOption = {
  title: 'Answer the beacon',
  rank: 'dangerous',
  situation: 'A beacon calls from the Drift.',
  reason: 'The roll.',
  groundedIn: [id(1)],
  drawsOn: {
    truths: [truth.id],
    locations: [EMBER],
    characters: [VESNA],
    launchFacts: [CONNECTION],
  },
};

describe('the inciting incident (9.2)', () => {
  it('accepts the chosen option’s words and rank, naming the option, and nothing of the vow', () => {
    const chosen = chooseOption(id(9), 2, OPTION);

    expect(toIncidentRequest(chosen)).toEqual({
      incident: { text: 'Answer the beacon', rank: 'dangerous' },
      proposal: { eventId: id(9), optionIndex: 2 },
    });
    // Editing keeps the option: the server records it as the Guide's, edited.
    expect(toIncidentRequest(setIncidentText(chosen, 'Answer it now'))?.proposal).toEqual({
      eventId: id(9),
      optionIndex: 2,
    });
  });

  it('writes your own from the words so far, without the option', () => {
    const own = writeOwn(chooseOption(id(9), 0, OPTION));
    expect(toIncidentRequest(own)).toEqual({
      incident: { text: 'Answer the beacon', rank: 'dangerous' },
    });
    expect(toIncidentRequest(EMPTY_INCIDENT_FORM)).toBeNull();
  });

  it('names what an option drew on, fact by fact (A37)', () => {
    const state = {
      ...emptyCampaignState({
        locations: { [EMBER]: { name: 'Ember Hold' } } as never,
        connection: { connectionId: CONNECTION, npcName: 'Esme Varga' } as never,
      }),
      characters: { [VESNA]: { name: 'Vesna Kade' } },
    } as unknown as CampaignState;

    expect(drawsOnNames(state, OPTION)).toEqual([
      truth.name,
      'Ember Hold',
      'Vesna Kade',
      'Esme Varga',
    ]);
  });

  it('opens on a newer draft, or on the accepted incident', () => {
    const accepted = { text: 'Accepted words', rank: 'extreme', seq: 3 } as never;
    expect(initialIncidentForm(emptyCampaignState({ incident: accepted }))).toEqual({
      text: 'Accepted words',
      rank: 'extreme',
    });
    const drafted = emptyCampaignState({
      incident: accepted,
      drafts: { incident_launch: { seq: 4, snapshot: toIncidentDraft(EMPTY_INCIDENT_FORM) } },
    } as never);
    expect(initialIncidentForm(drafted)).toEqual(EMPTY_INCIDENT_FORM);
  });
});
