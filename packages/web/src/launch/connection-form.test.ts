import { describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import type { CampaignState, EntityId, EventId } from '@astrolabe/shared';

import {
  CONNECTION_FIELD_ORACLES,
  applyFieldRoll,
  connectionTrack,
  emptyConnectionForm,
  heldConnectionProposal,
  initialConnectionForm,
  setField,
  takeConnectionProposal,
  toConnectionDraft,
  toConnectionRequest,
  toggleParticipant,
  editedConnectionFields,
} from './connection-form.js';
import { emptyCampaignState } from './state-fixture.js';

/** 9.1: the Connection half of Connection and Troubles (beat 10, D-167). */

const id = (n: number) => `0190f000-0000-7000-8000-00000000000${n}` as EventId;
const VESNA = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const ROOK = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const NPC = 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const TRACK = 'aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function withCrew(launch: Parameters<typeof emptyCampaignState>[0] = {}): CampaignState {
  const state = emptyCampaignState(launch);
  const member = (name: string) => ({ name }) as CampaignState['characters'][CharacterId];
  return {
    ...state,
    characters: {
      [VESNA]: { ...member('Vesna Kade'), id: VESNA },
      [ROOK]: { ...member('Rook Ilari'), id: ROOK },
    },
  };
}

const proposed = (value: string, groundedIn: readonly EventId[]) => ({
  value,
  reason: `Because ${value}.`,
  groundedIn,
});
const PROPOSAL = {
  npcName: proposed('Esme Varga', [id(5), id(6)]),
  role: proposed('Dockmaster', [id(1)]),
  goal: proposed('Keep the docks open', [id(2)]),
  firstLook: proposed('Oil-stained gloves', [id(3)]),
  disposition: proposed('Wary', [id(4)]),
};

describe('the local connection (9.1)', () => {
  it('rolls each field only from the declared NPC recipe, a name from two tables', () => {
    expect(CONNECTION_FIELD_ORACLES.npcName).toEqual([
      'oracle:characters/name/given',
      'oracle:characters/name/family-name',
    ]);
    expect(CONNECTION_FIELD_ORACLES.role).toEqual(['oracle:characters/role']);
  });

  it('starts shared by the whole crew, and needs a name, role and someone sharing it', () => {
    const empty = emptyConnectionForm(withCrew());
    expect(empty.participants).toEqual([VESNA, ROOK]);
    expect(toConnectionRequest(empty, id(9))).toBeNull();

    const named = setField(setField(empty, 'npcName', 'Esme Varga'), 'role', 'Dockmaster');
    expect(toConnectionRequest(named, id(9))).toMatchObject({
      npcName: 'Esme Varga',
      rank: 'dangerous',
    });
    const nobody = toggleParticipant(toggleParticipant(named, VESNA, false), ROOK, false);
    expect(toConnectionRequest(nobody, id(9))).toBeNull();
  });

  it('cites a field roll, and a name’s two rolls read as one name', () => {
    const rolled = applyFieldRoll(emptyConnectionForm(withCrew()), 'npcName', [
      { eventId: id(1), text: 'Esme' },
      { eventId: id(2), text: 'Varga' },
    ]);
    expect(rolled.npcName).toBe('Esme Varga');
    const body = toConnectionRequest(setField(rolled, 'role', 'Dockmaster'), id(9));
    expect(body?.groundedIn).toEqual([id(1), id(2)]);
  });

  it('takes the Guide’s fields by name, names the proposal, and leaves rank and crew alone', () => {
    const state = withCrew({
      proposals: {
        connection: {
          targetKind: 'connection',
          targetId: 'connection',
          proposal: PROPOSAL,
          rationale: 'A dockmaster knows everyone.',
          eventId: id(9),
        },
      } as unknown as CampaignState['launch']['proposals'],
    });
    const held = heldConnectionProposal(state)!;
    const start = toggleParticipant(emptyConnectionForm(state), ROOK, false);
    const rolledRole = applyFieldRoll(start, 'role', [{ eventId: id(7), text: 'Smuggler' }]);

    const taken = takeConnectionProposal(rolledRole, held, ['npcName', 'role']);

    expect(taken.npcName).toBe('Esme Varga');
    expect(taken.role).toBe('Dockmaster');
    expect(taken.participants).toEqual([VESNA]);
    const body = toConnectionRequest(taken, id(9))!;
    expect(body.proposalEventId).toBe(id(9));
    // The role's own roll is shed: its words come from the proposal now.
    expect(body.groundedIn).toBeUndefined();
    expect(editedConnectionFields(setField(taken, 'role', 'Harbormaster'), PROPOSAL)).toEqual([
      'role',
      'goal',
      'firstLook',
      'disposition',
    ]);
  });

  it('stops naming a proposal once the Guide is asked again (10.0a)', () => {
    const state = withCrew();
    const held = { eventId: id(8), proposal: PROPOSAL, rationale: 'r' };
    const body = toConnectionRequest(
      takeConnectionProposal(emptyConnectionForm(state), held),
      id(9),
    );
    expect(body?.proposalEventId).toBeUndefined();
    expect(body?.npcName).toBe('Esme Varga');
  });

  it('opens on the accepted connection with its NPC’s fields, or on a newer draft', () => {
    const accepted = {
      connectionId: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId,
      npcId: NPC,
      npcName: 'Esme Varga',
      role: 'Dockmaster',
      rank: 'formidable' as const,
      trackId: TRACK as never,
      participants: [VESNA],
      automaticStrongHit: true as const,
      provenance: 'player_written' as const,
      groundedIn: [id(1)],
      eventId: id(2),
      seq: 3,
    };
    const state = {
      ...withCrew({ connection: accepted }),
      entities: {
        [NPC]: {
          id: NPC,
          kind: 'npc',
          name: 'Esme Varga',
          fields: { role: 'Dockmaster', goal: 'Keep the docks open' },
        },
      },
    } as unknown as CampaignState;

    expect(initialConnectionForm(state)).toMatchObject({
      npcName: 'Esme Varga',
      goal: 'Keep the docks open',
      rank: 'formidable',
      participants: [VESNA],
      carried: [id(1)],
    });

    const drafted = {
      ...state,
      launch: {
        ...state.launch,
        drafts: {
          connection_troubles: {
            seq: 4,
            snapshot: {
              connection: { npcName: 'Drafted', details: { goal: 'Drafted goal' } },
              troubles: [],
            },
          },
        },
      },
    } as unknown as CampaignState;
    expect(initialConnectionForm(drafted)).toMatchObject({
      npcName: 'Drafted',
      goal: 'Drafted goal',
    });
  });

  it('saves the connection without erasing troubles drafted on the other half', () => {
    const troubles = [{ kind: 'sector' as const, text: 'A blockade chokes trade.' }];
    const state = withCrew({
      drafts: { connection_troubles: { seq: 4, snapshot: { troubles } } },
    } as Parameters<typeof emptyCampaignState>[0]);

    const draft = toConnectionDraft(state, setField(emptyConnectionForm(state), 'npcName', 'Esme'));

    expect(draft.troubles).toEqual(troubles);
    expect(draft.connection).toMatchObject({ npcName: 'Esme', participants: [VESNA, ROOK] });
  });

  it('shows the accepted connection’s track with who shares it', () => {
    const state = {
      ...withCrew({
        connection: {
          npcName: 'Esme Varga',
          rank: 'formidable',
          trackId: TRACK,
          participants: [VESNA],
        } as unknown as NonNullable<CampaignState['launch']['connection']>,
      }),
      tracks: {
        [TRACK]: {
          id: TRACK,
          kind: 'vow',
          title: 'Connection: Esme Varga',
          rank: 'formidable',
          ticks: 8,
          maxTicks: 40,
          participantCharacterIds: [VESNA, ROOK],
        },
      },
    } as unknown as CampaignState;

    expect(connectionTrack(state)).toEqual({
      title: 'Connection: Esme Varga',
      rank: 'formidable',
      boxes: 2,
      sharedBy: ['Vesna Kade', 'Rook Ilari'],
    });
  });
});
