import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
  type EventId,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { buildLaunchWorkspace } from '../launch/workspace.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { createCharacter } from './character-commands.js';
import { readEvents } from './event-store.js';
import {
  acceptLaunchIncident,
  configureLaunchSector,
  decideTruth,
  saveLaunchLocation,
  setStartingSettlement,
} from './launch-commands.js';
import { proposeIncidents } from './proposal-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 9.0f: accepting an incident names the Guide's option. The server
 * mints the incident's id, resolves what the option drew on to the events
 * of those accepted facts, and records whether the player kept or edited the
 * Guide's words (A41). Only accepted launch facts may be cited.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;

describe.skipIf(!hasTestDatabase)('accepting the inciting incident (9.0f)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('incident_acceptance');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  const truthId = STARFORGED.truths[0]!.id;

  async function campaign(): Promise<{ campaignId: CampaignId; characterId: CharacterId }> {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId,
      resolution: 'custom',
      text: 'The Exodus fleet never arrived whole.',
    });
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: {
        name: 'Juno Marr',
        callsign: 'Juno',
        stats: { edge: 1, heart: 2, iron: 1, shadow: 2, wits: 3 },
        assets: [],
      },
    });
    return { campaignId, characterId };
  }

  async function propose(campaignId: CampaignId) {
    const ai = new StubProvider({
      responses: [
        {
          kind: 'structured',
          value: {
            options: [1, 2, 3].map((n) => ({
              title: `Answer incident ${n}`,
              rank: 'dangerous',
              situation: `Incident ${n} has reached the relay.`,
              reason: `Roll ${n}.`,
              groundedIn: [`incident-${n}`],
              drawsOn: { crew: ['Juno'], truths: [truthId], locations: [] },
            })),
          },
        },
      ],
    });
    const proposed = await proposeIncidents(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
    });
    if (!proposed.ok) throw new Error(proposed.message);
    return proposed;
  }

  const details = (characterId: CharacterId, text: string) => ({
    text,
    rank: 'dangerous' as const,
    rollerId: characterId,
    participants: [characterId],
    openingScene: { title: 'The relay' },
  });

  it('cites the events of the facts the option drew on, and keeps the Guide’s words', async () => {
    const { campaignId, characterId } = await campaign();
    const proposed = await propose(campaignId);

    const result = await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: details(characterId, 'Answer incident 2'),
      proposal: { eventId: proposed.proposalEventId, optionIndex: 1 },
    });

    const events = await readEvents(db.sql, campaignId);
    const state = project(events);
    const incident = state.launch.incident!;
    expect(incident.incidentId).toBe((result.response as { incidentId: string }).incidentId);
    expect(incident.provenance).toBe('guide_proposal');
    expect(incident.groundedIn).toEqual(proposed.proposal.options[1]!.groundedIn);
    expect([...incident.citedFactEventIds].sort()).toEqual(
      [
        state.launch.truthDecisions[truthId]!.eventId,
        state.characters[characterId]!.eventId,
      ].sort(),
    );
    expect(events.at(-1)!.causedBy).toBe(proposed.proposalEventId);
  });

  it('records an edit, and keeps the incident’s id when it is revised', async () => {
    const { campaignId, characterId } = await campaign();
    const proposed = await propose(campaignId);
    const accept = (text: string) =>
      acceptLaunchIncident(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        incident: details(characterId, text),
        proposal: { eventId: proposed.proposalEventId, optionIndex: 0 },
      });

    const first = await accept('Answer incident 1');
    const second = await accept('The relay screams a dead captain’s name.');

    expect(second.response).toEqual(first.response);
    const incident = project(await readEvents(db.sql, campaignId)).launch.incident!;
    expect(incident.provenance).toBe('guide_proposal_edited');
    expect(incident.text).toBe('The relay screams a dead captain’s name.');
  });

  it('refuses an option that is not held, and a citation that is not an accepted fact', async () => {
    const { campaignId, characterId } = await campaign();
    const proposed = await propose(campaignId);

    await expect(
      acceptLaunchIncident(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        incident: details(characterId, 'Answer incident 1'),
        proposal: { eventId: proposed.proposalEventId, optionIndex: 5 },
      }),
    ).rejects.toMatchObject({ reason: 'unknown_proposal' });

    // A roll is not a fact the incident draws on.
    const roll = proposed.rolls[0]!.eventId as EventId;
    await expect(
      acceptLaunchIncident(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        incident: { ...details(characterId, 'A written incident.'), citedFactEventIds: [roll] },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_incident_citation' });
  });

  it('accepts a written incident as the player’s own', async () => {
    const { campaignId, characterId } = await campaign();
    // A first acceptance has nothing to carry forward, so it states a rank.
    await expect(
      acceptLaunchIncident(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        incident: { text: 'A written incident.' },
      }),
    ).rejects.toMatchObject({ reason: 'incident_rank_required' });

    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: details(characterId, 'A written incident.'),
    });

    const incident = project(await readEvents(db.sql, campaignId)).launch.incident!;
    expect(incident.provenance).toBe('player_written');
    expect(incident.citedFactEventIds).toEqual([]);
  });

  // 9.0g (D-200): beat 11 accepts the words, citations and rank; the review
  // page sets who swears, who shares, and the opening scene, by revision.
  it('accepts an incident without the vow’s choices, and readiness waits for them', async () => {
    const { campaignId } = await campaign();
    const proposed = await propose(campaignId);

    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: { text: 'Answer incident 1', rank: 'dangerous' },
      proposal: { eventId: proposed.proposalEventId, optionIndex: 0 },
    });

    const { state, readiness } = buildLaunchWorkspace(await readEvents(db.sql, campaignId));
    expect(state.launch.incident?.rollerId).toBeUndefined();
    expect(readiness.problems.map((problem) => problem.code)).toContain(
      'incident_vow_choices_missing',
    );
  });

  it('sets the choices by revision, keeping the Guide’s acceptance and stamping the settlement', async () => {
    const { campaignId, characterId } = await campaign();
    await configureLaunchSector(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      sector: { name: 'Lantern Reach', region: 'expanse' },
    });
    const added = await saveLaunchLocation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      location: {
        kind: 'settlement',
        name: 'Ember Hold',
        location: 'deep_space',
        population: 'Hundreds',
        authority: 'Corporate',
        projects: ['Rebuilding the relay'],
      },
    });
    const settlementId = (added.response as { locationId: EntityId }).locationId;
    await setStartingSettlement(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      settlementId,
    });
    const proposed = await propose(campaignId);
    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: { text: 'Answer incident 1', rank: 'dangerous' },
      proposal: { eventId: proposed.proposalEventId, optionIndex: 0 },
    });
    const accepted = project(await readEvents(db.sql, campaignId)).launch.incident!;

    // A stranger is refused before anything is written.
    await expect(
      acceptLaunchIncident(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        incident: {
          text: 'Answer incident 1',
          rank: 'dangerous',
          rollerId: newId<CharacterId>(),
        },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_incident_crew' });

    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      // The review page sends the choices alone; the words and rank carry forward.
      incident: {
        rollerId: characterId,
        participants: [characterId],
        // The client cannot place the scene; the server does (D-168).
        openingScene: { title: 'The relay', locationId: newId<EntityId>() } as { title: string },
      },
    });

    const revised = project(await readEvents(db.sql, campaignId)).launch.incident!;
    expect(revised.incidentId).toBe(accepted.incidentId);
    expect([revised.text, revised.rank]).toEqual(['Answer incident 1', 'dangerous']);
    expect(revised.provenance).toBe('guide_proposal');
    expect(revised.groundedIn).toEqual(accepted.groundedIn);
    expect(revised.citedFactEventIds).toEqual(accepted.citedFactEventIds);
    expect(revised.rollerId).toBe(characterId);
    expect(revised.participants).toEqual([characterId]);
    expect(revised.openingScene).toEqual({ title: 'The relay', locationId: settlementId });

    // Changing the rank on the review page is an edit of the Guide's incident.
    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: { text: 'Answer incident 1', rank: 'formidable' },
    });
    const reranked = project(await readEvents(db.sql, campaignId)).launch.incident!;
    expect(reranked.provenance).toBe('guide_proposal_edited');
    expect(reranked.rollerId).toBe(characterId);
  });
});
