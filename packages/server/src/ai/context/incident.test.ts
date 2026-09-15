import { describe, expect, it } from 'vitest';

import type { CampaignState } from '@astrolabe/shared';

import { project } from '../../projection/project.js';
import { createProviderFromEnv } from '../create-provider.js';

import {
  INCIDENT_PROPOSAL_ROLLS,
  INCIDENT_RULES,
  buildIncidentProposalRequest,
  checkIncidentProposal,
  incidentContext,
  incidentProposalSchema,
  resolveDrawsOn,
  type IncidentProposalOutput,
} from './incident.js';

/**
 * Task 4.6's prompt and check (D-132–D-134), without a database: state is
 * a projection over hand-built states, and only what the AI is offered and
 * what the server accepts are asserted. Proposal quality is not (§10).
 */

const EMPTY = project([]);

function withSetup(): CampaignState {
  const location = (id: string, name: string) => ({
    id: id as never,
    kind: 'location' as const,
    name,
    fields: { description: `${name}, described.` },
    provenance: { establishedBy: 'player' as const, groundedIn: [], eventId: id as never },
  });
  return {
    ...EMPTY,
    campaign: {
      id: 'c' as never,
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    },
    truths: {
      ['oracle:cataclysm' as never]: {
        text: 'The sun plague burned the old worlds.',
        source: 'written',
      },
    },
    entities: {
      ['l1' as never]: location('l1', 'Varga Relay'),
      ['l2' as never]: location('l2', 'Varga Relay'),
      ['l3' as never]: location('l3', 'Bleakhollow'),
    },
    sector: { routes: [{ from: 'l1' as never, to: 'l3' as never }] },
    characters: {
      ['v' as never]: {
        id: 'v' as never,
        name: 'Vesna Kade',
        callsign: 'Vesna',
        pronouns: 'she/her',
        hooks: ['She flew the last evacuation out.'],
        vowTrackIds: ['t' as never],
      } as never,
      ['r' as never]: {
        id: 'r' as never,
        name: 'Rook Ilari',
        callsign: 'Rook',
        pronouns: null,
        hooks: [],
        vowTrackIds: [],
      } as never,
    },
    tracks: {
      ['t' as never]: {
        id: 't' as never,
        kind: 'vow',
        title: 'Find the pilots left behind',
        rank: 'extreme',
        ticks: 0,
        maxTicks: 40,
        lastChangedBy: { actorKind: 'player' } as never,
      },
    },
  };
}

const ROLLED = INCIDENT_PROPOSAL_ROLLS.map((roll, i) => ({ ...roll, rowText: `Row ${i + 1}` }));
const KEYS = INCIDENT_PROPOSAL_ROLLS.map((roll) => roll.key);

function answer(drawsOn: IncidentProposalOutput['options'][number]['drawsOn']) {
  return {
    options: KEYS.map((key, i) => ({
      title: `Incident ${i + 1}`,
      rank: 'formidable' as const,
      situation: 'Something has happened.',
      reason: 'The roll.',
      groundedIn: [key],
      drawsOn,
    })),
  };
}

describe('the incident proposal request (4.6, D-132, D-133)', () => {
  it('rolls the inciting incident table once per option', () => {
    expect(INCIDENT_PROPOSAL_ROLLS).toHaveLength(3);
    expect(new Set(INCIDENT_PROPOSAL_ROLLS.map((r) => r.oracleId))).toEqual(
      new Set(['oracle:campaign-launch/inciting-incident']),
    );
  });

  it('offers truths, locations and crew under the keys the answer names them by', () => {
    const request = buildIncidentProposalRequest(withSetup(), ROLLED);

    expect(request.purpose).toBe('incident_proposal');
    expect(request.user).toContain(
      '- oracle:cataclysm (Cataclysm): The sun plague burned the old worlds.',
    );
    // Two locations with one name get distinct keys; routes are named by key.
    expect(request.user).toContain(
      '- Varga Relay (description: Varga Relay, described.); routes to Bleakhollow',
    );
    expect(request.user).toContain('- Varga Relay (2) (description: Varga Relay, described.)');
    expect(request.user).toContain(
      '- Vesna: Vesna Kade (she/her); background vow: "Find the pilots left behind" (extreme); backstory: She flew the last evacuation out.',
    );
    expect(request.user).toContain(
      '- Rook: Rook Ilari (pronouns not recorded); no backstory recorded',
    );
    expect(request.user).toContain('- incident-2 (Inciting incident): Row 2');
  });

  it('says plainly when there are no truths, locations or crew', () => {
    const request = buildIncidentProposalRequest(EMPTY, ROLLED);
    expect(request.user).toContain('Setting truths: none answered yet.');
    expect(request.user).toContain('Sector locations: none yet.');
    expect(request.user).toContain('The crew: no characters have been created yet');
  });

  it("carries the narrator's authority rules and forbids invented names (D-134, §4)", () => {
    expect(INCIDENT_RULES).toContain('Undeclared action:');
    expect(INCIDENT_RULES).toContain('Player-owned interior:');
    expect(INCIDENT_RULES).toContain('Do not invent named people, places, ships or factions.');
  });
});

describe('the incident proposal answer (4.6, D-132)', () => {
  it('constrains every citation to what exists, and asks only for parts the campaign has', () => {
    const context = incidentContext(withSetup());
    const schema = incidentProposalSchema(KEYS, context);

    const parts = { truths: [], locations: [], crew: [] };
    expect(
      schema.safeParse(answer({ ...parts, truths: ['oracle:cataclysm'], crew: ['Vesna'] })).success,
    ).toBe(true);
    expect(schema.safeParse(answer({ ...parts, locations: ['Varga Relay (2)'] })).success).toBe(
      true,
    );
    expect(schema.safeParse(answer({ ...parts, crew: ['Juno'] })).success).toBe(false);
    // A part the campaign has is asked for, even when the option uses none of it.
    expect(schema.safeParse(answer({ crew: ['Vesna'] })).success).toBe(false);
    const unrolled = answer(parts);
    unrolled.options[0] = { ...unrolled.options[0]!, groundedIn: ['incident-9'] };
    expect(schema.safeParse(unrolled).success).toBe(false);
    expect(schema.safeParse({ options: answer(parts).options.slice(0, 2) }).success).toBe(false);

    const bare = incidentProposalSchema(KEYS, incidentContext(EMPTY));
    expect(bare.safeParse(answer({})).success).toBe(true);
  });

  it('asks for different options that draw on the truths and the crew when there are any', () => {
    const context = incidentContext(withSetup());
    const same = answer({ truths: ['oracle:cataclysm'], crew: ['Rook'] });
    same.options[1] = { ...same.options[1]!, title: ' incident 1 ' };

    expect(checkIncidentProposal(same, context)).toMatch(/same title/);
    expect(checkIncidentProposal(answer({ crew: ['Vesna'] }), context)).toMatch(/setting truths/);
    expect(checkIncidentProposal(answer({ truths: ['oracle:cataclysm'] }), context)).toMatch(
      /crew/,
    );
    expect(
      checkIncidentProposal(answer({ truths: ['oracle:cataclysm'], crew: ['Vesna'] }), context),
    ).toBeUndefined();
    expect(checkIncidentProposal(answer({}), incidentContext(EMPTY))).toBeUndefined();
  });

  it('resolves keys to ids, once each', () => {
    const context = incidentContext(withSetup());
    expect(
      resolveDrawsOn(
        {
          truths: ['oracle:cataclysm'],
          locations: ['Varga Relay (2)', 'Varga Relay (2)'],
          crew: ['Rook'],
        },
        context,
      ),
    ).toEqual({ truths: ['oracle:cataclysm'], locations: ['l2'], characters: ['r'] });
  });
});

describe('the dev stub (ASTROLABE_AI_PROVIDER=stub)', () => {
  it('answers an incident proposal that passes the schema and the check, with or without a crew', async () => {
    for (const state of [EMPTY, withSetup()]) {
      const context = incidentContext(state);
      const result = await createProviderFromEnv({
        ASTROLABE_AI_PROVIDER: 'stub',
      }).generateStructured(
        buildIncidentProposalRequest(state, ROLLED),
        incidentProposalSchema(KEYS, context),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(checkIncidentProposal(result.value, context)).toBeUndefined();
    }
  });
});
