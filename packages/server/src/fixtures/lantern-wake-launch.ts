import type { CharacterId, MoveId, TrackId } from '@astrolabe/rules';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  type ActivateLaunchResponse,
  type CampaignId,
  type CreateCharacterResponse,
  type EntityId,
  type EstablishLaunchConnectionResponse,
  type EventId,
  type InvokeMoveResponse,
  type LaunchWorkspaceResponse,
  type NarrationFrame,
  type ProposeCharacterResponse,
  type ProposeConnectionResponse,
  type ProposeIncidentsResponse,
  type ProposeSectorResponse,
  type ProposeStarshipResponse,
  type ProposeTroubleResponse,
  type RollLaunchRecipeResponse,
  type SaveLaunchLocationResponse,
  type SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import type { AiRequest } from '../ai/provider.js';
import { devStubResponse } from '../ai/create-provider.js';
import type { StubResponse } from '../ai/stub.js';

import {
  action,
  d100,
  nothingNew,
  openScript,
  segments,
  type FixtureScript,
  type ScriptOptions,
} from './http-script.js';
import type { Face } from './loaded-dice.js';

/**
 * `lantern-wake-launch`: the golden launch, beats 1–13, played through the
 * HTTP routes the launch screens call (10.1b, D-205, A44).
 *
 * A blank campaign becomes Lantern Wake: fourteen truths decided four ways,
 * a crew of three built three ways, one shared ship, the Outlands with three
 * settlements built three ways, a starting settlement with its trouble, a
 * sector trouble, a connection shared by all three, and the inciting
 * incident. Launch then begins Session 1 at Deepwater Anchorage, and Vesna
 * swears the vow with the real move, which is narrated.
 *
 * `session-1` continues from here (D-205). The crew's stats are session 1's
 * own arrays, so every later outcome rests on the same numbers.
 */

export const LANTERN_WAKE_LAUNCH = 'lantern-wake-launch';

const SWEAR_AN_IRON_VOW = 'move:quest/swear-an-iron-vow' as MoveId;

export const INCITING_INCIDENT = "Recover the flight recorder of Meridian's Hope";
export const OPENING_SCENE = 'A beacon at Deepwater Anchorage';

export interface LaunchOptions {
  /** Keys every stable id, so fixtures built on the launch can sit side by side. */
  readonly fixture: string;
  readonly campaignId: CampaignId;
  readonly campaignName: string;
  /** Play against a live Guide instead of the script (10.5). */
  readonly live?: ScriptOptions['live'];
}

export interface LaunchRun {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly characters: {
    readonly vesna: CharacterId;
    readonly rook: CharacterId;
    readonly juno: CharacterId;
  };
  readonly vowId: TrackId;
  readonly locations: {
    readonly anchorage: EntityId;
    readonly drift: EntityId;
    readonly relay: EntityId;
    readonly third: EntityId;
  };
  /** What each beat's calls answered, for `golden-launch.test.ts` (10.2). */
  readonly beats: {
    readonly reopened: LaunchWorkspaceResponse;
    readonly vesnaProposal: ProposeCharacterResponse;
    readonly junoProposal: ProposeCharacterResponse;
    readonly starshipProposal: ProposeStarshipResponse;
    readonly sectorProposal: ProposeSectorResponse;
    readonly settlementTrouble: ProposeTroubleResponse;
    readonly sectorTrouble: ProposeTroubleResponse;
    readonly connectionProposal: ProposeConnectionResponse;
    readonly connection: EstablishLaunchConnectionResponse;
    readonly incidents: ProposeIncidentsResponse;
    readonly ready: LaunchWorkspaceResponse;
    readonly activated: ActivateLaunchResponse;
    readonly swear: InvokeMoveResponse;
    readonly swearPassage: EventId;
    readonly swearWorld: readonly NarrationFrame[];
    readonly launched: LaunchWorkspaceResponse;
  };
  /** Every request the scripted Guide was sent, in order. */
  readonly requests: readonly AiRequest[];
}

/** Session 1's arrays (D-205): every later outcome rests on them. */
export const CREW_STATS = {
  vesna: { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 },
  rook: { edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 },
  juno: { edge: 1, heart: 1, iron: 2, shadow: 2, wits: 3 },
} as const;

/** The dev stub's answer to a request, with some of its fields replaced. */
const stubbed =
  (patch: (value: Record<string, unknown>) => Record<string, unknown>) =>
  (request: AiRequest): StubResponse => {
    const answer = devStubResponse(request, 'structured');
    if (answer.kind !== 'structured') throw new Error(`No dev stub for ${request.purpose}.`);
    return { kind: 'structured', value: patch(answer.value as Record<string, unknown>) };
  };

const cite = (value: string, reason: string, groundedIn: readonly string[]) => ({
  value,
  reason,
  groundedIn: [...groundedIn],
});

export async function playLanternWakeLaunch(sql: Sql, options: LaunchOptions): Promise<LaunchRun> {
  const script = openScript(sql, {
    fixture: options.fixture,
    campaignId: options.campaignId,
    ...(options.live !== undefined ? { live: options.live } : {}),
  });
  try {
    return await play(script, options);
  } finally {
    await script.close();
  }
}

async function play(script: FixtureScript, options: LaunchOptions): Promise<LaunchRun> {
  const { http, id, rolling, say } = script;
  const campaignId = options.campaignId;
  const recipe = (label: string, selector: Record<string, unknown>, faces: readonly Face[]) =>
    rolling(faces, () =>
      http.post<RollLaunchRecipeResponse>('/launch/recipe-rolls', {
        commandId: id(`${label}:roll`),
        selector,
      }),
    );
  const eventIds = (rolled: RollLaunchRecipeResponse) => rolled.results.map((r) => r.eventId);

  // --- Beat 1: begin a campaign --------------------------------------------
  script.at('Beat 1');
  await http.root('/campaigns', {
    campaignId,
    commandId: id('campaign:create'),
    name: options.campaignName,
    settings: DEFAULT_CAMPAIGN_SETTINGS,
  });
  const premise =
    'A crew bound to a lost colony ship, chasing its last signal across the Outlands.';
  await http.put('/launch/drafts', {
    commandId: id('foundation:draft'),
    draft: { section: 'foundation', snapshot: { premise } },
  });
  const reopened = await http.get<LaunchWorkspaceResponse>('/launch');
  await http.post('/launch/foundation', {
    commandId: id('foundation:accept'),
    premise,
    settings: DEFAULT_CAMPAIGN_SETTINGS,
  });

  // --- Beat 2: the truths ---------------------------------------------------
  // Picked, rolled, written and left open; one with a subchoice, one revised.
  script.at('Beat 2');
  const truth = (label: string, body: Record<string, unknown>, faces: readonly Face[] = []) =>
    rolling(faces, () => http.post('/launch/truths', { commandId: id(`truth:${label}`), ...body }));
  const pick = (truthId: string, optionIndex: number, extra: Record<string, unknown> = {}) =>
    truth(truthId, { truthId, resolution: 'selected', optionIndex, ...extra });
  const rolled = (truthId: string, faces: readonly Face[]) =>
    truth(truthId, { truthId, resolution: 'rolled' }, faces);
  await pick('oracle:cataclysm', 0, {
    subchoiceId: 'oracle:cataclysm/0',
    subchoiceOptionIndex: 0,
  });
  await pick('oracle:exodus', 0);
  await pick('oracle:communities', 0);
  await pick('oracle:iron', 1);
  await rolled('oracle:laws', d100(50));
  await rolled('oracle:religion', d100(80));
  await pick('oracle:magic', 0);
  await rolled('oracle:communication-and-data', d100(20));
  await pick('oracle:medicine', 1);
  await rolled('oracle:artificial-intelligence', d100(60));
  await pick('oracle:war', 2);
  await truth('oracle:lifeforms', {
    truthId: 'oracle:lifeforms',
    resolution: 'custom',
    text: 'Life in the Forge is stubborn: it clings to ice, to hulls, to anything warm.',
  });
  await pick('oracle:precursors', 0);
  await truth('oracle:horrors', { truthId: 'oracle:horrors', resolution: 'leave_open' });
  // Revised before launch: the earlier answer stays in its history (A26, A40).
  await rolling([], () =>
    http.post('/launch/truths', {
      commandId: id('truth:oracle:iron:revise'),
      truthId: 'oracle:iron',
      resolution: 'selected',
      optionIndex: 0,
    }),
  );

  // --- Beat 3: propose Vesna -------------------------------------------------
  script.at('Beat 3');
  const vesnaRolls = await recipe('vesna', { kind: 'character' }, d100(10, 20, 30, 40, 50));
  say('character_proposal', {
    kind: 'structured',
    value: {
      name: cite('Vesna Kade', 'The two name rolls, together.', ['given-name', 'family-name']),
      callsign: cite('Vesna', 'She flies under her own name.', ['callsign']),
      stats: { value: CREW_STATS.vesna, reason: 'A pilot leads with her edge.' },
      assets: [
        { assetId: 'asset:path/ace', reason: 'A daring pilot.' },
        { assetId: 'asset:path/navigator', reason: 'She trusts charts.' },
        { assetId: 'asset:path/explorer', reason: 'She goes where the charts end.' },
      ],
      backgroundVow: {
        title: 'Chart a safe passage through the Kessel Drift',
        rank: 'dangerous',
        reason: 'A navigator’s vow.',
      },
      hooks: [
        {
          text: 'She once flew a route no chart would admit existed.',
          reason: 'The first prompt.',
          groundedIn: ['backstory-1'],
        },
        {
          text: 'An institution she trusted sold her charts to the highest bidder.',
          reason: 'The second prompt.',
          groundedIn: ['backstory-2'],
        },
      ],
      pronouns: { value: 'she/her', reason: 'The concept says she.' },
      appearance: {
        value: 'A flight jacket patched with the insignia of three dead fleets.',
        reason: 'A pilot who has flown for many.',
      },
      backstory: {
        kind: 'written',
        text: 'Vesna learned to fly on salvage runs and to navigate by distrusting every official chart.',
        reason: 'Both prompts.',
        groundedIn: ['backstory-1', 'backstory-2'],
      },
      signatureGear: { value: null, reason: 'The concept names none.' },
    },
  });
  const vesnaProposal = await http.post<ProposeCharacterResponse>('/character-proposals', {
    commandId: id('vesna:proposal'),
    concept: 'A daring pilot and navigator (she/her) who trusts charts more than institutions.',
    targetId: 'draft-vesna',
    groundedIn: eventIds(vesnaRolls),
  });
  // Kept whole, except the last asset: Sensor Array (A29, A41).
  const { characterId: vesna } = await http.post<CreateCharacterResponse>('/launch/crew', {
    commandId: id('vesna:accept'),
    draft: {
      name: 'Vesna Kade',
      callsign: 'Vesna',
      stats: CREW_STATS.vesna,
      assets: ['asset:path/ace', 'asset:path/navigator', 'asset:module/sensor-array'],
    },
    backgroundVow: { title: 'Chart a safe passage through the Kessel Drift', rank: 'dangerous' },
    hooks: [
      'She once flew a route no chart would admit existed.',
      'An institution she trusted sold her charts to the highest bidder.',
    ],
    pronouns: 'she/her',
    proposalCommandId: id('vesna:proposal'),
    groundedIn: eventIds(vesnaRolls),
    launch: {
      appearance: 'A flight jacket patched with the insignia of three dead fleets.',
      backstory: {
        kind: 'written',
        text: 'Vesna learned to fly on salvage runs and to navigate by distrusting every official chart.',
      },
      signatureGear: 'Her grandmother’s brass sextant, recalibrated for the Forge.',
    },
  });

  // --- Beat 4: Rook, by hand -------------------------------------------------
  script.at('Beat 4');
  const { characterId: rook } = await http.post<CreateCharacterResponse>('/launch/crew', {
    commandId: id('rook:accept'),
    draft: {
      name: 'Rook Ilari',
      callsign: 'Rook',
      stats: CREW_STATS.rook,
      assets: ['asset:path/veteran', 'asset:path/armored', 'asset:path/gunner'],
    },
    backgroundVow: { title: 'Find the commander who left my unit to die', rank: 'formidable' },
    launch: {
      appearance: 'Heavyset, scarred across one cheek, never without his armor.',
      // Some of his history is deliberately a mystery (beat 4).
      backstory: { kind: 'discover_in_play' },
    },
  });

  // --- Beat 5: Juno, with mixed help -----------------------------------------
  script.at('Beat 5');
  const junoRolls = await recipe('juno', { kind: 'character' }, d100(15, 25, 35, 45, 55));
  say(
    'character_proposal',
    stubbed((value) => ({
      ...value,
      name: cite('Juno Marr', 'The two name rolls, together.', ['given-name', 'family-name']),
      callsign: cite('Juno', 'Short, like her.', ['callsign']),
      stats: { value: CREW_STATS.juno, reason: 'A tinkerer leads with her wits.' },
      assets: [
        { assetId: 'asset:path/gearhead', reason: 'She fixes things.' },
        { assetId: 'asset:path/scavenger', reason: 'She finds things.' },
        { assetId: 'asset:companion/utility-bot', reason: 'Something she built.' },
      ],
      backgroundVow: {
        title: 'Rebuild the drive that killed my mentor',
        rank: 'dangerous',
        reason: 'Her hooks point at a loss.',
      },
      hooks: [
        {
          text: 'Her mentor died in a drive failure she was sure she could have prevented.',
          reason: 'The first prompt.',
          groundedIn: ['backstory-1'],
        },
        {
          text: 'She keeps a scavenger’s ledger of every debt owed to her.',
          reason: 'The second prompt.',
          groundedIn: ['backstory-2'],
        },
      ],
    })),
  );
  const junoProposal = await http.post<ProposeCharacterResponse>('/character-proposals', {
    commandId: id('juno:proposal'),
    concept: 'A salvager and engineer who talks to her machines.',
    targetId: 'draft-juno',
    groundedIn: eventIds(junoRolls),
    fields: ['hooks', 'backgroundVow'],
  });
  // Her hooks and vow from the Guide, one hook edited; the rest by hand.
  const { characterId: juno } = await http.post<CreateCharacterResponse>('/launch/crew', {
    commandId: id('juno:accept'),
    draft: {
      name: 'Juno Marr',
      callsign: 'Juno',
      stats: CREW_STATS.juno,
      assets: ['asset:path/gearhead', 'asset:path/scavenger', 'asset:companion/utility-bot'],
    },
    backgroundVow: { title: 'Rebuild the drive that killed my mentor', rank: 'dangerous' },
    hooks: [
      'Her mentor died in a drive failure she still believes she could have prevented.',
      'She keeps a scavenger’s ledger of every debt owed to her.',
    ],
    proposalCommandId: id('juno:proposal'),
    groundedIn: eventIds(junoRolls),
    launch: {
      appearance: 'Grease to the elbows, a utility bot trailing her like a shadow.',
      backstory: {
        kind: 'written',
        text: 'Juno apprenticed to a drive engineer on a scrapyard station until the accident.',
      },
    },
  });

  // --- Beat 6: the Lantern Wake -----------------------------------------------
  script.at('Beat 6');
  const shipRolls = await recipe(
    'starship',
    { kind: 'starship', quirkCount: 2 },
    d100(40, 30, 50, 70),
  );
  say(
    'starship_proposal',
    stubbed((value) => ({
      ...value,
      name: cite('Lantern Wake', 'The name roll, read as a light left behind.', ['name']),
      appearance: {
        value: 'A long-haul freighter, its hull a quilt of patches.',
        reason: 'Its history.',
      },
      quirks: [
        cite('Its timers and clocks always run slightly off.', 'The first quirk roll.', [
          'quirk_1',
        ]),
        cite(
          'The cargo hold hums a note no one can find the source of.',
          'The second quirk roll.',
          ['quirk_2'],
        ),
      ],
    })),
  );
  const starshipProposal = await http.post<ProposeStarshipResponse>('/starship-proposals', {
    commandId: id('starship:proposal'),
    groundedIn: eventIds(shipRolls),
  });
  if (!starshipProposal.ok) script.fail('no ship proposal');
  // The quirk kept, the appearance edited (beat 6).
  await http.post('/launch/starship', {
    commandId: id('starship:accept'),
    starship: {
      name: 'Lantern Wake',
      appearance: 'A long-haul freighter with a lantern-shaped running light at its bow.',
      history: starshipProposal.proposal.history.value,
      quirks: starshipProposal.proposal.quirks.map((quirk: { value: string }) => quirk.value),
    },
    proposalEventId: starshipProposal.proposalEventId,
  });

  // --- Beat 7: the Outlands ---------------------------------------------------
  script.at('Beat 7');
  await http.post('/launch/sector', {
    commandId: id('sector:configure'),
    sector: { name: 'The Kessel Reach', region: 'outlands' },
  });
  // One proposal per object (D-196): the name, then three settlements, each
  // settled in deep space so none asks for a planet.
  say(
    'sector_name_proposal',
    stubbed((value) => value),
  );
  say(
    'settlement_proposal',
    stubbed((value) => value),
    stubbed((value) => value),
    stubbed((value) => value),
  );
  const sectorProposal = await rolling(
    [
      ...d100(30, 60),
      ...d100(12, 90, 40, 50, 22),
      ...d100(33, 85, 60, 20, 44),
      ...d100(54, 95, 10, 70, 66),
    ],
    () =>
      http.post<ProposeSectorResponse>('/sector-proposals', { commandId: id('sector:proposal') }),
  );
  const proposed = sectorProposal.settlements[0];
  if (proposed === undefined || !proposed.ok) script.fail('no settlement proposal');
  // Deepwater Anchorage begins as the Guide's settlement, renamed (A41).
  const { locationId: anchorage } = await http.post<SaveLaunchLocationResponse>(
    '/launch/locations',
    {
      commandId: id('anchorage:accept'),
      location: {
        kind: 'settlement',
        name: 'Deepwater Anchorage',
        location: proposed.proposal.location.value,
        population: proposed.proposal.population.value,
        authority: proposed.proposal.authority.value,
        projects: proposed.proposal.projects.map((project: { value: string }) => project.value),
      },
      proposalEventId: proposed.proposalEventId,
      proposalTargetId: proposed.targetId,
    },
  );
  // Varga Relay, entered by hand.
  const { locationId: relay } = await http.post<SaveLaunchLocationResponse>('/launch/locations', {
    commandId: id('relay:accept'),
    location: {
      kind: 'settlement',
      name: 'Varga Relay',
      location: 'deep_space',
      population: 'Few',
      authority: 'None',
      projects: ['Keeping the relay dark'],
    },
  });
  // The third settlement, from direct rolls, on a rocky world.
  const thirdRolls = await recipe(
    'third',
    { kind: 'settlement', region: 'outlands', projectCount: 1 },
    d100(70, 20, 30, 40, 60),
  );
  const classRolls = await recipe('third:class', { kind: 'planet_class' }, d100(80));
  const planetRolls = await recipe(
    'third:planet',
    { kind: 'planet', planetClass: 'rocky', depth: 'shallow' },
    d100(25),
  );
  const row = (slot: string) =>
    thirdRolls.results.find((result) => result.slot === slot)?.text ?? script.fail(`no ${slot}`);
  const { locationId: third } = await http.post<SaveLaunchLocationResponse>('/launch/locations', {
    commandId: id('third:accept'),
    location: {
      kind: 'settlement',
      name: row('name'),
      location: 'planetside',
      population: row('population'),
      authority: row('authority'),
      projects: [row('project_1')],
    },
    planet: {
      details: {
        kind: 'planet',
        name: planetRolls.results[0]?.text ?? script.fail('no planet name'),
        planetClass: 'rocky',
        details: {},
      },
      groundedIn: [...eventIds(classRolls), ...eventIds(planetRolls)],
    },
    groundedIn: eventIds(thirdRolls),
  });
  // Kessel Drift, a known place that is not a settlement.
  const { locationId: drift } = await http.post<SaveLaunchLocationResponse>('/launch/locations', {
    commandId: id('drift:accept'),
    location: {
      kind: 'other',
      name: 'Kessel Drift',
      description: 'A slow river of broken ice and old wreckage.',
    },
  });

  // --- Beat 8: draw the sector ------------------------------------------------
  script.at('Beat 8');
  const route = (
    label: string,
    from: EntityId,
    to: EntityId | { kind: 'off_map'; label: string },
  ) => http.post('/launch/routes', { commandId: id(`route:${label}`), route: { from, to } });
  await route('anchorage-drift', anchorage, drift);
  await route('drift-relay', drift, relay);
  await route('anchorage-third', anchorage, third);
  await route('relay-exit', relay, { kind: 'off_map', label: 'Toward the Terminus' });
  await http.put('/launch/sector-layout', {
    commandId: id('sector:layout'),
    coordinates: {
      [anchorage]: { x: 120, y: 200 },
      [drift]: { x: 320, y: 180 },
      [relay]: { x: 520, y: 140 },
      [third]: { x: 160, y: 380 },
    },
  });

  // --- Beat 9: zoom in, and trouble ------------------------------------------
  script.at('Beat 9');
  await http.post('/launch/starting-settlement', {
    commandId: id('anchorage:start'),
    settlementId: anchorage,
  });
  const startRolls = await recipe(
    'anchorage:start',
    { kind: 'starting_settlement', firstLookCount: 2 },
    d100(20, 60, 45),
  );
  const startRow = (slot: string) =>
    startRolls.results.find((result) => result.slot === slot) ?? script.fail(`no ${slot}`);
  await http.post('/launch/locations', {
    commandId: id('anchorage:first-looks'),
    locationId: anchorage,
    location: {
      kind: 'settlement',
      name: 'Deepwater Anchorage',
      location: proposed.proposal.location.value,
      population: proposed.proposal.population.value,
      authority: proposed.proposal.authority.value,
      projects: proposed.proposal.projects.map((project: { value: string }) => project.value),
      firstLooks: [startRow('first_look_1').text, startRow('first_look_2').text],
    },
    // Still the Guide's settlement, as the form keeps naming it (8.0f).
    proposalEventId: proposed.proposalEventId,
    proposalTargetId: proposed.targetId,
    groundedIn: [startRow('first_look_1').eventId, startRow('first_look_2').eventId],
  });
  // The settlement's trouble: the Guide reads the roll, and the words are edited.
  say(
    'trouble_proposal',
    stubbed((value) => value),
  );
  const settlementTrouble = await http.post<ProposeTroubleResponse>('/trouble-proposals', {
    commandId: id('anchorage:trouble:proposal'),
    kind: 'settlement',
    ownerId: anchorage,
    groundedIn: [startRow('trouble').eventId],
  });
  if (!settlementTrouble.ok) script.fail('no settlement trouble');
  await http.post('/launch/troubles', {
    commandId: id('anchorage:trouble:accept'),
    trouble: {
      kind: 'settlement',
      ownerId: anchorage,
      text: 'The anchorage’s hull-lashings are failing, and no one will pay to replace them.',
    },
    proposalEventId: settlementTrouble.proposalEventId,
  });
  const sectorTroubleRolls = await recipe('sector:trouble', { kind: 'sector_trouble' }, d100(30));
  say(
    'trouble_proposal',
    stubbed((value) => ({
      ...value,
      text: cite(
        'Raiders prey on the ice haulers crossing the Drift.',
        'The sector trouble roll, read against the truths.',
        ['trouble'],
      ),
    })),
  );
  const sectorTrouble = await http.post<ProposeTroubleResponse>('/trouble-proposals', {
    commandId: id('sector:trouble:proposal'),
    kind: 'sector',
    groundedIn: eventIds(sectorTroubleRolls),
  });
  if (!sectorTrouble.ok) script.fail('no sector trouble');
  await http.post('/launch/troubles', {
    commandId: id('sector:trouble:accept'),
    trouble: { kind: 'sector', text: sectorTrouble.proposal.text.value },
    proposalEventId: sectorTrouble.proposalEventId,
  });

  // --- Beat 10: a local connection --------------------------------------------
  script.at('Beat 10');
  const npcRolls = await recipe(
    'connection',
    { kind: 'starting_connection' },
    d100(40, 50, 60, 70, 20, 30),
  );
  say(
    'connection_proposal',
    stubbed((value) => ({
      ...value,
      npcName: cite('Ossian Venn', 'The two name rolls.', ['given_name', 'family_name']),
    })),
  );
  const connectionProposal = await http.post<ProposeConnectionResponse>('/connection-proposals', {
    commandId: id('connection:proposal'),
    groundedIn: eventIds(npcRolls),
  });
  if (!connectionProposal.ok) script.fail('no connection proposal');
  const person = connectionProposal.proposal;
  // The role edited, the rank chosen, and all three share it (beat 10).
  const connection = await http.post<EstablishLaunchConnectionResponse>('/launch/connection', {
    commandId: id('connection:accept'),
    npcName: person.npcName.value,
    role: 'Anchorage harbormaster',
    rank: 'dangerous',
    participants: [vesna, rook, juno],
    details: {
      goal: person.goal.value,
      firstLook: person.firstLook.value,
      disposition: person.disposition.value,
    },
    proposalEventId: connectionProposal.proposalEventId,
  });

  // --- Beat 11: the inciting incident -----------------------------------------
  script.at('Beat 11');
  say(
    'incident_proposal',
    stubbed((value) => value),
  );
  const incidents = await rolling(d100(15, 45, 75), () =>
    http.post<ProposeIncidentsResponse>('/incident-proposals', {
      commandId: id('incident:proposal'),
    }),
  );
  if (!incidents.ok) script.fail('no incidents');
  // The second option, chosen and edited into Christopher's words.
  await http.post('/launch/incident', {
    commandId: id('incident:accept'),
    incident: { text: INCITING_INCIDENT, rank: incidents.proposal.options[1]!.rank },
    proposal: { eventId: incidents.proposalEventId, optionIndex: 1 },
  });

  // --- Beat 12: review and launch ---------------------------------------------
  script.at('Beat 12');
  await http.post('/launch/incident', {
    commandId: id('incident:choices'),
    incident: {
      rank: 'formidable',
      rollerId: vesna,
      participants: [vesna, rook, juno],
      openingScene: { title: OPENING_SCENE },
    },
  });
  const ready = await http.get<LaunchWorkspaceResponse>('/launch');
  if (!ready.readiness.ready)
    script.fail(`not ready: ${ready.readiness.problems.map((p) => p.code).join(', ')}`);
  const activated = await http.post<ActivateLaunchResponse>('/launch/activate', {
    commandId: id('launch:activate'),
  });

  // --- Beat 13: swear the first vow -------------------------------------------
  script.at('Beat 13');
  const swear = await script.move(
    'swear',
    {
      moveId: SWEAR_AN_IRON_VOW,
      actorCharacterId: vesna,
      using: { using: 'stat', stat: 'heart' },
      actionText: 'Vesna lays her hand on the beacon receiver and swears to find the recorder.',
      swearsPendingVow: true,
    },
    action(5, [3, 4]),
    'strong_hit',
  );
  const swearPassage = await script.narrate(
    'swear',
    id('swear:move'),
    segments(
      ['character_does', 'Vesna', ['F2'], 'Vesna lays her hand on the receiver and swears it.'],
      [
        'world',
        null,
        [],
        'Across the anchorage, the beacon keeps calling, patient as it has been for forty years.',
      ],
    ),
  );
  say('world_plan', nothingNew('The vow and the beacon are already in the passage.'));
  const swearWorld = await script.worldPass('swear', swearPassage);
  const launched = await http.get<LaunchWorkspaceResponse>('/launch');
  script.assertSpent();

  const vowId = launched.state.launch.activation?.vowTrackId;
  if (vowId === undefined) script.fail('the vow was not sworn');
  return {
    campaignId,
    sessionId: activated.sessionId as SessionId,
    characters: { vesna, rook, juno },
    vowId,
    locations: { anchorage, drift, relay, third },
    beats: {
      reopened,
      vesnaProposal,
      junoProposal,
      starshipProposal,
      sectorProposal,
      settlementTrouble,
      sectorTrouble,
      connectionProposal,
      connection,
      incidents,
      ready,
      activated,
      swear,
      swearPassage,
      swearWorld,
      launched,
    },
    requests: script.guide.requests,
  };
}
