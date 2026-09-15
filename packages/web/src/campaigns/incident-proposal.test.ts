import { describe, expect, it } from 'vitest';

import type { ProposalRoll } from '@astrolabe/shared';

import {
  drawsOnLabels,
  holdsOption,
  optionRolls,
  wouldReplaceWriting,
  type IncidentOption,
} from './incident-proposal.js';

const option: IncidentOption = {
  title: 'Recover the flight recorder of a lost colony ship',
  rank: 'formidable',
  situation: 'A colony ship went silent on a crossing.',
  reason: 'The rolled incident, on the relay route.',
  groundedIn: ['e2' as never],
  drawsOn: {
    truths: ['oracle:cataclysm' as never, 'oracle:gone' as never],
    locations: ['l1' as never],
    characters: ['v' as never, 'gone' as never],
  },
};

const roll = (eventId: string, n: number): ProposalRoll => ({
  eventId: eventId as never,
  oracleId: 'oracle:campaign-launch/inciting-incident' as never,
  label: 'Inciting incident',
  roll: n,
  rowText: `Row ${n}`,
});

describe('incident option cards (4.6, D-132)', () => {
  it('shows only the rolls an option cites', () => {
    const rolls = [roll('e1', 4), roll('e2', 37), roll('e3', 70)];
    expect(optionRolls(option, rolls)).toEqual([rolls[1]]);
  });

  it('names what an option draws on, dropping anything no longer there', () => {
    const labels = drawsOnLabels(
      option,
      {
        entities: { ['l1' as never]: { name: 'Varga Relay' } as never },
        characters: { ['v' as never]: { callsign: 'Vesna' } as never },
      },
      [{ id: 'oracle:cataclysm' as never, name: 'Cataclysm' }],
    );
    expect(labels).toEqual(['Cataclysm', 'Varga Relay', 'Vesna']);
  });
});

describe('the vow form against a used option', () => {
  it('holds the option only with its exact title and rank', () => {
    expect(holdsOption({ title: ` ${option.title} `, rank: 'formidable' }, option)).toBe(true);
    expect(holdsOption({ title: option.title, rank: 'extreme' }, option)).toBe(false);
    expect(holdsOption({ title: `${option.title}!`, rank: 'formidable' }, option)).toBe(false);
  });

  it('asks before replacing words the player wrote, never an empty form or an untouched option', () => {
    expect(wouldReplaceWriting({ title: '  ', rank: 'formidable' }, undefined)).toBe(false);
    expect(wouldReplaceWriting({ title: 'My own incident', rank: 'formidable' }, undefined)).toBe(
      true,
    );
    expect(wouldReplaceWriting({ title: option.title, rank: 'formidable' }, option)).toBe(false);
    expect(wouldReplaceWriting({ title: 'Edited it', rank: 'formidable' }, option)).toBe(true);
  });
});
