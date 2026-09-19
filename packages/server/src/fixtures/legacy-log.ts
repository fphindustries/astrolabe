import {
  STARFORGED,
  STARSHIP_ASSET_ID,
  STARTING_MOMENTUM,
  startingMeters,
  type CharacterId,
  type TrackId,
} from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
  type SceneId,
  type SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { createCampaign } from '../db/campaign-commands.js';
import { appendCommand, type NewEvent } from '../db/event-store.js';
import { beginSession } from '../db/session-commands.js';
import { derivedUuid } from '../db/uuid.js';

/**
 * A Milestone 1 campaign's log, frozen (10.1d, D-206, A43).
 *
 * D-206 retires the commands that wrote these events, and existing databases
 * still hold them, so A43 is proved against the events themselves. Each
 * command's events are appended exactly as it wrote them: legacy truths
 * (`truth.set`), characters carrying the Starship grant (D-89), location
 * entities and their routes, and the crew-level inciting vow. `legacy-log.test.ts`
 * diffed this against the commands while both existed.
 *
 * `inPlay` adds Milestone 1's first session, begun on a scene at the
 * anchorage, so the same log serves both halves of A43: without a session the
 * campaign opens Finish campaign launch, and with one it opens play.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };

export interface LegacyLogOptions {
  readonly campaignId: CampaignId;
  readonly name: string;
  readonly inPlay: boolean;
}

export interface LegacyLogRun {
  readonly characters: Readonly<Record<'vesna' | 'rook' | 'juno', CharacterId>>;
  readonly locations: Readonly<Record<'anchorage' | 'drift' | 'relay', EntityId>>;
  readonly vowId: TrackId;
}

export async function appendMilestoneOneLog(
  sql: Sql,
  options: LegacyLogOptions,
): Promise<LegacyLogRun> {
  const { campaignId } = options;
  const key = <T extends string>(purpose: string) => derivedUuid(campaignId, purpose) as T;
  const append = (label: string, kind: string, events: readonly NewEvent[]) =>
    appendCommand(sql, {
      campaignId,
      commandId: key<CommandId>(`command:${label}`),
      kind,
      actor: PLAYER,
      events,
    });

  await createCampaign(sql, {
    campaignId,
    commandId: key<CommandId>('command:campaign'),
    actor: PLAYER,
    name: options.name,
  });

  // `setTruth`'s events: the legacy shape D-183 folds into truth decisions.
  const truths = [
    ['oracle:cataclysm', 'picked', STARFORGED.truths[0]!.rows[0]!.text],
    ['oracle:communities', 'rolled', 'Our settlements are few and far between.', 42],
    ['oracle:iron', 'written', 'Iron is scarce, and every shard of it is sworn upon.'],
  ] as const;
  for (const [oracleId, source, text, roll] of truths) {
    await append(`truth:${oracleId}`, 'truth.set', [
      {
        type: 'truth.set',
        payload: { oracleId, source, text, ...(roll === undefined ? {} : { roll }) } as never,
      },
    ]);
  }

  // Milestone 1's character events: the chosen assets and the granted Starship.
  const crew = [
    [
      'vesna',
      'Vesna Kade',
      'Vesna',
      { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 },
      ['asset:path/ace', 'asset:path/navigator', 'asset:module/sensor-array'],
      'she/her',
    ],
    [
      'rook',
      'Rook Ilari',
      'Rook',
      { edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 },
      ['asset:path/veteran', 'asset:path/armored', 'asset:path/gunner'],
      undefined,
    ],
    [
      'juno',
      'Juno Marr',
      'Juno',
      { edge: 1, heart: 1, iron: 2, shadow: 2, wits: 3 },
      ['asset:path/gearhead', 'asset:path/scavenger', 'asset:companion/utility-bot'],
      undefined,
    ],
  ] as const;
  const characters = {} as Record<'vesna' | 'rook' | 'juno', CharacterId>;
  for (const [label, name, callsign, stats, assets, pronouns] of crew) {
    const characterId = key<CharacterId>(`character:${label}`);
    characters[label] = characterId;
    await append(`character:${label}`, 'character.create', [
      {
        type: 'character.created',
        payload: {
          characterId,
          name,
          callsign,
          stats,
          meters: startingMeters(STARFORGED.gameRules),
          momentum: STARTING_MOMENTUM,
          assets: [...assets, STARSHIP_ASSET_ID],
          ...(pronouns === undefined ? {} : { pronouns }),
        } as never,
        subjectCharacterId: characterId,
      },
    ]);
  }

  // `addSectorLocation`'s and `addSectorRoute`'s events.
  const places = [
    ['anchorage', 'Deepwater Anchorage', 'A ring of lashed-together hulls where the crew trades.'],
    ['drift', 'Kessel Drift', 'A slow river of broken ice and old wreckage.'],
    ['relay', 'Varga Relay', 'A derelict relay station at the edge of the sector.'],
  ] as const;
  const locations = {} as Record<'anchorage' | 'drift' | 'relay', EntityId>;
  for (const [label, name, description] of places) {
    const entityId = key<EntityId>(`location:${label}`);
    locations[label] = entityId;
    await append(`location:${label}`, 'sector.add_location', [
      {
        type: 'entity.established',
        payload: {
          entityId,
          kind: 'location',
          name,
          fields: { description },
          provenance: { establishedBy: 'player', groundedIn: [] },
        },
      },
    ]);
  }
  for (const [label, from, to] of [
    ['anchorage-drift', locations.anchorage, locations.drift],
    ['drift-relay', locations.drift, locations.relay],
  ] as const) {
    await append(`route:${label}`, 'sector.add_route', [
      { type: 'sector.route_added', payload: { fromLocationId: from, toLocationId: to } },
    ]);
  }

  // `swearIncitingVow`'s event: a crew-level vow, with no roll and no roller.
  const vowId = key<TrackId>('track:vow');
  await append('vow', 'campaign.swear_inciting_vow', [
    {
      type: 'track.created',
      payload: {
        kind: 'vow',
        trackId: vowId,
        title: "Recover the flight recorder of Meridian's Hope",
        rank: 'formidable',
      },
    },
  ]);

  if (options.inPlay) {
    await beginSession(sql, {
      campaignId,
      commandId: key<CommandId>('command:session'),
      actor: PLAYER,
      scene: { title: 'A beacon at Deepwater Anchorage', locationId: locations.anchorage },
      ids: { sessionId: key<SessionId>('session:1'), sceneId: key<SceneId>('scene:1') },
    });
  }

  return { characters, locations, vowId };
}
