import { installedModules, STARFORGED } from '@astrolabe/rules';
import type { CampaignState, EntityId } from '@astrolabe/shared';

/**
 * Projected campaign state as the AI reads it (task 7.4): "context assembly
 * from projected state, not raw transcript".
 *
 * Bounded by construction — `CampaignState` is the bounded read model, so
 * this block does not grow with the length of a campaign the way a
 * transcript would. It carries what the world *is*: truths, where the crew
 * stands, their condition, what presses on them, who is here. It carries no
 * character interiority, because the event log holds none (§3).
 */
/**
 * How an open truth is stated to the Guide (D-162).
 *
 * One string because it is one fact. It was written twice — once here and
 * once in `renderSetup` — and the two spellings had already drifted apart by
 * a dash, which is two prompts for one rule.
 */
export const TRUTH_LEFT_OPEN = 'deliberately left open — do not settle it';

/** D-193: how a Milestone 1 campaign's ship reaches world context. */
export const LEGACY_STARSHIP_LINE =
  "The crew's shared starship: one Starship command vehicle, shared by the whole crew.";

/**
 * The crew's ship in one line, or undefined before it is established.
 *
 * Shared by play context and incident context, for `TRUTH_LEFT_OPEN`'s
 * reason: one fact, one spelling. Installed modules are derived from the crew
 * (D-191) and named with their owner (D-190). The integrity is the projected
 * value, so play narration sees damage once anything writes it.
 */
export function renderStarship(state: CampaignState): string | undefined {
  const ship = state.launch.starship;
  if (ship === undefined) return undefined;
  const modules = installedModules(Object.values(state.characters), STARFORGED).map((module) => {
    const name = STARFORGED.assets.find((asset) => asset.id === module.assetId)?.name;
    const owner = Object.values(state.characters).find(
      (character) => character.id === module.ownerCharacterId,
    )?.name;
    return `${name ?? module.assetId} (${owner ?? 'unknown'}'s)`;
  });
  return (
    `${ship.name}, integrity ${ship.integrity.value} of ${ship.integrity.max} - ${ship.appearance}; ` +
    `history: ${ship.history}; quirks: ${ship.quirks.join(' / ')}` +
    (modules.length > 0 ? `; installed modules: ${modules.join(', ')}` : '')
  );
}

/**
 * The starting sector in one line, or undefined before it is configured
 * (8.0j). Shared by play and setup context, for `renderStarship`'s reason.
 * The star is the sector's (D-195).
 */
export function renderSectorLine(state: CampaignState): string | undefined {
  const sector = state.launch.sector;
  if (sector === undefined) return undefined;
  const star = sector.starId === undefined ? undefined : state.launch.locations[sector.starId];
  return (
    `${sector.name}, in the ${sector.region}` +
    (star?.kind === 'star'
      ? `; its star: ${star.name}${star.details.description === undefined ? '' : ` (${star.details.description})`}`
      : '')
  );
}

/**
 * The sector's places as play reads them (8.0j): each settlement with its
 * detail and planet, each other location, the passages between them, and the
 * troubles. Planets and the star are details, not places of their own (D-165).
 */
function renderSectorPlaces(state: CampaignState): string[] {
  const launch = state.launch;
  const nameOf = (id: EntityId) => launch.locations[id]?.name ?? 'an unknown place';
  return Object.values(launch.locations)
    .filter((location) => location.kind === 'settlement' || location.kind === 'other')
    .map((location) => {
      const start = launch.startingSettlementId === location.id ? ' [starting settlement]' : '';
      const planet =
        location.kind === 'settlement' && location.planetId !== undefined
          ? launch.locations[location.planetId]
          : undefined;
      const passages = launch.routes.flatMap((route) =>
        route.from === location.id
          ? [typeof route.to === 'string' ? nameOf(route.to) : `off-map: ${route.to.label}`]
          : route.to === location.id
            ? [nameOf(route.from)]
            : [],
      );
      return (
        `- ${location.name}${start} (${launchLocationDetail(state, location.id)})` +
        (planet === undefined
          ? ''
          : `; planet ${planet.name} (${launchLocationDetail(state, planet.id)})`) +
        (passages.length > 0 ? `; passages to ${passages.join(', ')}` : '')
      );
    });
}

export function renderState(state: CampaignState): string {
  const sections: string[] = [];

  // D-183: one representation, and this is the reason it is one. This read
  // used to be `state.truths`, the Milestone 1 fold — so a campaign that
  // decided its truths through Campaign Launch was narrated by a Guide that
  // knew none of them. Nothing failed; the truths were simply invisible.
  const truths = Object.entries(state.launch.truthDecisions).map(([oracleId, decision]) => {
    const question = STARFORGED.truths.find((t) => t.id === oracleId)?.name ?? oracleId;
    // D-162: an open truth is a fact that the category is deliberately
    // undefined, not an unanswered question the Guide may quietly settle.
    const answer = decision.resolution === 'leave_open' ? TRUTH_LEFT_OPEN : (decision.text ?? '');
    return `- ${question}: ${answer}`;
  });
  if (truths.length > 0) {
    sections.push(`Setting truths:\n${truths.join('\n')}`);
  }

  if (state.scene !== null) {
    const id = state.scene.locationId;
    // 8.0j: activation opens Session 1 at a launch location (D-168), which is
    // not an entity, so resolving only `entities` put the opening scene at no
    // place at all.
    const entity = id === undefined ? undefined : state.entities[id];
    const launchLocation = id === undefined ? undefined : state.launch.locations[id];
    const where =
      entity !== undefined
        ? ` at ${entity.name}${describeFields(entity.fields)}`
        : launchLocation !== undefined
          ? ` at ${launchLocation.name}`
          : '';
    sections.push(`Current scene: ${state.scene.title}${where}.`);
  }

  // 8.0j: D-183's defect a third time, for the sector. Play context read no
  // launch sector, so a launched campaign was narrated by a Guide that did not
  // know where the crew starts or what troubles it.
  const sector = renderSectorLine(state);
  if (sector !== undefined) {
    const places = renderSectorPlaces(state);
    sections.push(
      `The starting sector: ${sector}.` + (places.length > 0 ? `\n${places.join('\n')}` : ''),
    );
  }
  const troubles = Object.values(state.launch.troubles).map(
    (trouble) => `- ${troubleLabel(state, trouble)}: ${trouble.text}`,
  );
  if (troubles.length > 0) {
    sections.push(`Troubles:\n${troubles.join('\n')}`);
  }

  // 9.0k: D-183's defect a fourth time, for the incident. Play context read
  // no `launch.incident`, so until the vow was sworn the Guide in play did not
  // know why the campaign had begun.
  const incident = state.launch.incident;
  if (incident !== undefined) {
    sections.push(`The inciting incident: ${incident.text}`);
  }
  const activation = state.launch.activation;
  if (activation !== undefined && activation.vowTrackId === undefined) {
    const nameOf = (id: string) =>
      Object.values(state.characters).find((c) => c.id === id)?.name ?? 'an unknown crew member';
    const vow = activation.pendingVow;
    // The participants include the roller; the vow is shared with the others.
    const sharing = vow.participants.filter((id) => id !== vow.rollerId).map(nameOf);
    // D-168: the vow is pending until the player swears it with the real
    // move, so the Guide is told it is not sworn yet rather than left to say so.
    sections.push(
      `The inciting vow (${vow.rank}) is not yet sworn: ${nameOf(vow.rollerId)} is to swear it ` +
        `with Swear an Iron Vow` +
        (sharing.length > 0 ? `, shared with ${sharing.join(', ')}.` : '.'),
    );
  }

  const crew = Object.values(state.characters).map((c) => {
    const meters = `health ${c.meters.health.value}, spirit ${c.meters.spirit.value}, supply ${c.meters.supply.value}`;
    const impacts = Object.keys(c.impacts).map(
      (id) => STARFORGED.gameRules.impacts.find((i) => i.id === id)?.label ?? id,
    );
    const assets = c.assets.map((id) => STARFORGED.assets.find((a) => a.id === id)?.name ?? id);
    // D-131: named when recorded; when not, said so rather than left for
    // the AI to fill with a default. What to do then is a standing rule
    // (`GUIDE_RULES`, `CREATION_RULES`), not state.
    const pronouns = c.pronouns ?? 'pronouns not recorded';
    return (
      `- ${c.name}, called ${c.callsign} (${pronouns}): ${meters}, momentum ${c.momentum.value}` +
      (impacts.length > 0 ? `; impacts: ${impacts.join(', ')}` : '') +
      (assets.length > 0 ? `; assets: ${assets.join(', ')}` : '') +
      (c.hooks.length > 0 ? `; backstory: ${c.hooks.join(' / ')}` : '')
    );
  });
  if (crew.length > 0) {
    sections.push(`The crew:\n${crew.join('\n')}`);
  }

  // 7.0h: D-183's defect again, for the ship. Play context read no
  // `launch.starship`, so a launched campaign was narrated by a Guide that did
  // not know the crew's ship by name.
  const ship = renderStarship(state);
  if (ship !== undefined) {
    sections.push(`The crew's shared starship: ${ship}.`);
  } else if (Object.values(state.characters).some((c) => c.legacyStarshipGrant === true)) {
    // D-193's interim line: a Milestone 1 campaign's ship was a granted asset
    // on every character, which the fold no longer lists among their assets.
    // Until 10.1 rebuilds the fixtures on a launched ship, say it once here so
    // the Guide does not lose the ship the crew flies.
    sections.push(LEGACY_STARSHIP_LINE);
  }

  const tracks = Object.values(state.tracks).map((t) =>
    t.kind === 'clock'
      ? `- Clock "${t.title}": ${t.ticks} of ${t.maxTicks} segments filled`
      : `- ${t.kind === 'vow' ? 'Vow' : 'Expedition'} (${t.rank ?? 'unranked'}) "${t.title}": ${Math.floor(t.ticks / 4)} of 10 progress boxes`,
  );
  if (tracks.length > 0) {
    sections.push(`Vows, expeditions and clocks:\n${tracks.join('\n')}`);
  }

  const people = Object.values(state.entities)
    .filter((e) => e.kind === 'npc' || e.kind === 'faction')
    .map((e) => `- ${e.name} (${e.kind})${describeFields(e.fields)}`);
  if (people.length > 0) {
    sections.push(`Established characters and factions:\n${people.join('\n')}`);
  }

  return sections.join('\n\n');
}

function describeFields(fields: Readonly<Record<string, string>>): string {
  const parts = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return parts.length === 0 ? '' : ` (${parts.join('; ')})`;
}

/** One label per trouble, so the citation key and the rendered line agree. */
export function troubleLabel(
  state: CampaignState,
  trouble: CampaignState['launch']['troubles'][EntityId],
): string {
  const owner =
    trouble.kind === 'settlement'
      ? (state.launch.locations[trouble.ownerId]?.name ?? 'a settlement')
      : 'the sector';
  return `Trouble in ${owner}`;
}

/** Typed launch-location detail, to the depth the launch actually recorded. */
export function launchLocationDetail(state: CampaignState, id: EntityId): string {
  const location = state.launch.locations[id];
  if (location === undefined) return '';
  switch (location.kind) {
    case 'settlement':
      return [
        location.location,
        `population: ${location.population}`,
        `authority: ${location.authority}`,
        `projects: ${location.projects.join(', ')}`,
        ...(location.firstLooks === undefined
          ? []
          : [`first looks: ${location.firstLooks.join(', ')}`]),
      ].join('; ');
    case 'planet':
      return [
        `planet, class ${location.planetClass}`,
        ...Object.entries(location.details).flatMap(([field, value]) =>
          value === undefined ? [] : [`${field}: ${value}`],
        ),
      ].join('; ');
    case 'star':
      return [
        'star',
        ...(location.details.description === undefined ? [] : [location.details.description]),
      ].join('; ');
    case 'other':
      return location.description;
  }
}
