import { installedModules, STARFORGED } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';

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
    const location =
      state.scene.locationId === undefined ? undefined : state.entities[state.scene.locationId];
    const where =
      location === undefined ? '' : ` at ${location.name}${describeFields(location.fields)}`;
    sections.push(`Current scene: ${state.scene.title}${where}.`);
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
