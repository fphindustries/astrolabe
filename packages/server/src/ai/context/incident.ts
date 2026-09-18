import { STARFORGED, type CharacterId, type OracleId } from '@astrolabe/rules';
import { ChallengeRankSchema, type CampaignState, type EntityId } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { NARRATOR_RULES, rubricText } from './authority-rubric.js';
import type { RolledForProposal } from './creation.js';
import {
  launchLocationDetail,
  renderSectorLine,
  renderStarship,
  troubleLabel,
  TRUTH_LEFT_OPEN,
} from './render-state.js';

/**
 * AI-proposed inciting incidents' prompt (task 4.6, D-132–D-134). Pure, like
 * the rest of this directory: campaign state and the server's oracle
 * results in; an `AiRequest`, its output schema and its check out.
 */

const INCIDENT_TABLE = 'oracle:campaign-launch/inciting-incident' as OracleId;

/** One roll per option (D-132), in roll order. */
export const INCIDENT_PROPOSAL_ROLLS: readonly {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
}[] = [1, 2, 3].map((n) => ({
  key: `incident-${n}`,
  label: 'Inciting incident',
  oracleId: INCIDENT_TABLE,
}));

export const INCIDENT_OPTION_COUNT = INCIDENT_PROPOSAL_ROLLS.length;

/**
 * What an option can draw on, keyed the way the AI names it: a truth by its
 * oracle id, a location by its name, a crew member by callsign. Each key
 * resolves to the id `incident.proposed` stores. A repeated name gets a
 * numbered key, so two locations called the same never collapse into one.
 */
export interface IncidentContext {
  readonly truths: ReadonlyMap<string, OracleId>;
  readonly locations: ReadonlyMap<string, EntityId>;
  readonly crew: ReadonlyMap<string, CharacterId>;
  /**
   * The remaining accepted launch facts an incident may cite (D-168): the
   * shared starship, settlement and sector trouble, and the local connection.
   * One category rather than three near-identical enums — they are all
   * entities, and what matters to A37 is that the option names the fact it
   * drew on.
   */
  readonly launchFacts: ReadonlyMap<string, EntityId>;
}

export function incidentContext(state: CampaignState): IncidentContext {
  const launchTruths = Object.keys(state.launch.truthDecisions);
  // Typed now (D-176), so the structural guard this used to need is gone.
  const launchLocations = Object.values(state.launch.locations);
  return {
    // D-183: one representation. `truth.set` folds into the same map, so a
    // Milestone 1 campaign and a launched one look identical from here.
    truths: new Map(launchTruths.map((id) => [id, id as OracleId])),
    locations: keyed([
      ...Object.values(state.entities)
        .filter((entity) => entity.kind === 'location')
        .map((entity) => [entity.name, entity.id] as const),
      ...launchLocations.map((location) => [location.name, location.id] as const),
    ]),
    crew: keyed(Object.values(state.characters).map((c) => [c.callsign, c.id])),
    launchFacts: keyed(launchFactEntries(state)),
  };
}

/** Accepted launch facts, labelled the way the answer will name them. */
function launchFactEntries(state: CampaignState): (readonly [string, EntityId])[] {
  const entries: (readonly [string, EntityId])[] = [];
  const ship = state.launch.starship;
  if (ship !== undefined) entries.push([`Starship: ${ship.name}`, ship.starshipId]);
  for (const trouble of Object.values(state.launch.troubles))
    entries.push([troubleLabel(state, trouble), trouble.troubleId]);
  const connection = state.launch.connection;
  if (connection !== undefined)
    entries.push([`Connection: ${connection.npcName}`, connection.connectionId]);
  return entries;
}

function keyed<T>(entries: readonly (readonly [string, T])[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const [name, value] of entries) {
    let key = name;
    for (let n = 2; map.has(key); n++) {
      key = `${name} (${n})`;
    }
    map.set(key, value);
  }
  return map;
}

export const INCIDENT_RULES = `You help a crew launch an Ironsworn: Starforged campaign. The inciting incident is the situation that sets the crew on their way, and the players swear it as the campaign's first vow. You propose ${INCIDENT_OPTION_COUNT} different options; the players pick one, edit it or write their own. You propose; the players decide.

Each option:
- title: the vow as the crew would swear it. One sentence, starting with a verb ("Recover…", "Defend…"), at most 20 words.
- rank: troublesome, dangerous, formidable, extreme or epic, fitting the scale of what the vow asks.
- situation: one or two sentences on what has happened and what is at stake as the campaign opens. It describes the world and the situation. It never says what a crew member feels, wants, decides or does about it: whether and how they answer is the players' choice.
- reason: one short sentence tying the option to its roll and to what it draws on.
- groundedIn: the keys of the oracle rolls the option builds on, at least one. The server rolled one per option. Prefer a different roll for each option; if two options build on the same roll, take it in clearly different directions.
- drawsOn: the setting truths (by key), sector locations (by name), crew members (by callsign) and other launch facts - the starship, a trouble, the local connection - the option builds from. List only what the option really uses.

Tie the options to this campaign. Across the options, draw on the setting truths when there are any, the sector's locations when there are any, the established troubles and local connection when there are any, and, when there is a crew, on at least one crew member's recorded backstory. A quest starter is inspiration offered by a truth, never something the campaign has already decided; a truth marked deliberately left open stays open. A crew member's backstory can say why the situation touches them, using only what their record says; never add to a character's past.

Do not invent named people, places, ships or factions. Use names the campaign already has, or describe ("a colony ship", "two feuding settlements"). The players can add names when they edit.

What the players own holds in a proposal as it does in narration:
${rubricText(NARRATOR_RULES)}
No player character speaks in a proposal.

Where no crew member's pronouns are recorded, refer to them only by name or callsign.`;

/** Task 4.6's request. */
export function buildIncidentProposalRequest(
  state: CampaignState,
  rolls: readonly RolledForProposal[],
): AiRequest {
  const user = [
    `<campaign>\n${renderSetup(state)}\n</campaign>`,
    `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
    `Propose ${INCIDENT_OPTION_COUNT} inciting incidents.`,
  ].join('\n\n');

  return {
    purpose: 'incident_proposal',
    system: [{ text: INCIDENT_RULES }],
    user,
    effort: 'medium',
  };
}

/**
 * Campaign setup as the proposal reads it: truths and locations with the
 * keys the answer names them by, and the crew's record. Unlike
 * `renderState`, it says plainly when a part is empty (D-133), so the AI
 * doesn't take silence for a crew with no past.
 */
export function renderSetup(state: CampaignState): string {
  const context = incidentContext(state);
  const sections: string[] = [`Campaign: ${state.campaign?.name ?? 'unnamed'}`];
  // 8.0j: the sector's own name, region and star, which no section said.
  const sector = renderSectorLine(state);
  if (sector !== undefined) sections.push(`The starting sector: ${sector}.`);

  const truths = [...context.truths].map(([key, id]) => {
    const question = STARFORGED.truths.find((t) => t.id === id)?.name ?? id;
    const launch = state.launch.truthDecisions[id];
    const answer = launch?.resolution === 'leave_open' ? TRUTH_LEFT_OPEN : (launch?.text ?? '');
    // D-162: a quest starter is inspiration for the incident, never canon.
    const starter =
      launch?.questStarter === undefined
        ? ''
        : `; quest starter (inspiration only): ${launch.questStarter}`;
    return `- ${key} (${question}): ${answer}${starter}`;
  });
  sections.push(
    truths.length > 0
      ? `Setting truths:\n${truths.join('\n')}`
      : 'Setting truths: none answered yet.',
  );

  const nameOf = new Map([...context.locations].map(([key, id]) => [id, key]));
  const locations = [...context.locations].map(([key, id]) => {
    // A Milestone 1 location carries loose `fields`; a launch location is a
    // typed settlement, planet or star. Both render, so a campaign built
    // either way reads the same to the Guide.
    const fields = Object.entries(state.entities[id]?.fields ?? {})
      .map(([field, value]) => `${field}: ${value}`)
      .join('; ');
    const detail = launchLocationDetail(state, id);
    const routes = [
      ...state.sector.routes
        .filter((route) => route.from === id || route.to === id)
        .map((route) => nameOf.get(route.from === id ? route.to : route.from)),
      ...state.launch.routes
        .filter((route) => route.from === id || route.to === id)
        .map((route) =>
          route.from === id
            ? typeof route.to === 'string'
              ? nameOf.get(route.to)
              : `off-map: ${route.to.label}`
            : nameOf.get(route.from),
        ),
    ].filter((name) => name !== undefined);
    const start = state.launch.startingSettlementId === id ? ' [starting settlement]' : '';
    return (
      `- ${key}${start}` +
      (fields.length > 0 ? ` (${fields})` : '') +
      (detail.length > 0 ? ` (${detail})` : '') +
      (routes.length > 0 ? `; routes to ${routes.join(', ')}` : '')
    );
  });
  sections.push(
    locations.length > 0
      ? `Sector locations:\n${locations.join('\n')}`
      : 'Sector locations: none yet.',
  );

  const crew = [...context.crew].map(([key, id]) => {
    const c = state.characters[id];
    if (c === undefined) {
      return `- ${key}`;
    }
    // A launch character records its background vow and backstory directly
    // (D-163); a Milestone 1 one carries hooks and a sworn vow track.
    const vows = [
      ...(c.backgroundVow === undefined
        ? []
        : [`"${c.backgroundVow.title}" (${c.backgroundVow.rank})`]),
      ...c.vowTrackIds
        .map((trackId) => state.tracks[trackId])
        .filter((track) => track !== undefined)
        .map((track) => `"${track.title}" (${track.rank ?? 'unranked'})`),
    ];
    const backstory =
      c.backstory?.kind === 'discover_in_play'
        ? '; backstory: deliberately undecided, to discover in play'
        : c.backstory?.kind === 'written'
          ? `; backstory: ${c.backstory.text}`
          : c.hooks.length > 0
            ? `; backstory: ${c.hooks.join(' / ')}`
            : '; no backstory recorded';
    return (
      `- ${key}: ${c.name} (${c.pronouns ?? 'pronouns not recorded'})` +
      (c.appearance === undefined ? '' : `; appearance: ${c.appearance}`) +
      (vows.length > 0 ? `; background vow: ${vows.join(', ')}` : '') +
      backstory
    );
  });
  sections.push(
    crew.length > 0
      ? `The crew:\n${crew.join('\n')}`
      : 'The crew: no characters have been created yet, so draw on the truths and the sector only.',
  );

  // D-168's remaining accepted facts. Each says plainly when it is absent,
  // for the same reason the sections above do (D-133).
  const ship = renderStarship(state);
  sections.push(
    ship === undefined ? 'The starship: not established yet.' : `The starship: ${ship}`,
  );

  const troubles = Object.values(state.launch.troubles).map(
    (trouble) => `- ${troubleLabel(state, trouble)}: ${trouble.text}`,
  );
  sections.push(
    troubles.length > 0 ? `Troubles:\n${troubles.join('\n')}` : 'Troubles: none established yet.',
  );

  const connection = state.launch.connection;
  sections.push(
    connection === undefined
      ? 'The local connection: not established yet.'
      : `The local connection: ${connection.npcName}, ${connection.role} (${connection.rank}), shared with ${connection.participants
          .map((characterId) => state.characters[characterId]?.callsign ?? characterId)
          .join(', ')}`,
  );

  return sections.join('\n\n');
}

export interface IncidentOptionOutput {
  readonly title: string;
  readonly rank: z.infer<typeof ChallengeRankSchema>;
  readonly situation: string;
  readonly reason: string;
  readonly groundedIn: readonly string[];
  readonly drawsOn: {
    readonly truths?: readonly string[];
    readonly locations?: readonly string[];
    readonly crew?: readonly string[];
    readonly launchFacts?: readonly string[];
  };
}

export interface IncidentProposalOutput {
  readonly options: readonly IncidentOptionOutput[];
}

/**
 * The shape the AI answers in. Everything an option can cite is an enum of
 * what exists, so constrained decoding can't name a roll, truth, location
 * or crew member that isn't there. A part with nothing in it is left out
 * of `drawsOn`, because an enum needs a value.
 */
export function incidentProposalSchema(
  rollKeys: readonly string[],
  context: IncidentContext,
): z.ZodType<IncidentProposalOutput> {
  const oneOf = (keys: Iterable<string>) => {
    const values = [...keys];
    return values.length > 0 ? z.array(z.enum(values as [string, ...string[]])) : undefined;
  };
  const drawsOn = Object.fromEntries(
    (
      [
        ['truths', oneOf(context.truths.keys())],
        ['locations', oneOf(context.locations.keys())],
        ['crew', oneOf(context.crew.keys())],
        ['launchFacts', oneOf(context.launchFacts.keys())],
      ] as const
    ).filter(([, schema]) => schema !== undefined),
  );
  return z.object({
    options: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          rank: ChallengeRankSchema,
          situation: z.string().min(1).max(500),
          reason: z.string().min(1).max(300),
          groundedIn: z.array(z.enum(rollKeys as [string, ...string[]])).min(1),
          drawsOn: z.object(drawsOn),
        }),
      )
      .length(INCIDENT_OPTION_COUNT),
  }) as unknown as z.ZodType<IncidentProposalOutput>;
}

/**
 * What the schema can't say (D-132): the options differ, and together they
 * draw on the campaign as it stands — its truths and, when there is a
 * crew, someone's background (D-133). Returns the problems in words, for
 * the re-ask, or undefined.
 */
export function checkIncidentProposal(
  value: IncidentProposalOutput,
  context: IncidentContext,
): string | undefined {
  const problems: string[] = [];

  const titles = value.options.map((option) => option.title.trim().toLowerCase());
  if (new Set(titles).size < titles.length) {
    problems.push('Two options have the same title; make every option a different incident.');
  }
  const anyDraws = (part: keyof IncidentOptionOutput['drawsOn']) =>
    value.options.some((option) => (option.drawsOn[part]?.length ?? 0) > 0);
  if (context.truths.size > 0 && !anyDraws('truths')) {
    problems.push('No option draws on the setting truths; tie at least one option to them.');
  }
  if (context.crew.size > 0 && !anyDraws('crew')) {
    problems.push(
      "No option draws on the crew; tie at least one option to a crew member's recorded backstory.",
    );
  }

  return problems.length === 0 ? undefined : problems.join(' ');
}

/** The answer's keys, resolved to the ids `incident.proposed` stores. */
export function resolveDrawsOn(
  drawsOn: IncidentOptionOutput['drawsOn'],
  context: IncidentContext,
): {
  truths: OracleId[];
  locations: EntityId[];
  characters: CharacterId[];
  launchFacts?: EntityId[];
} {
  const resolve = <T>(keys: readonly string[] | undefined, map: ReadonlyMap<string, T>) => [
    ...new Set((keys ?? []).flatMap((key) => (map.has(key) ? [map.get(key) as T] : []))),
  ];
  const launchFacts = resolve(drawsOn.launchFacts, context.launchFacts);
  return {
    truths: resolve(drawsOn.truths, context.truths),
    locations: resolve(drawsOn.locations, context.locations),
    characters: resolve(drawsOn.crew, context.crew),
    // Omitted when empty rather than stored as [], so a proposal that cited no
    // launch fact looks the same as one written before they existed.
    ...(launchFacts.length > 0 ? { launchFacts } : {}),
  };
}
