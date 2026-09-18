import {
  REGION_BASELINES,
  buildSettlementRecipe,
  settlementLocationFromRow,
  withoutLinks,
  type LaunchReadiness,
  type LaunchRegion,
  type OracleId,
  type PlanetClass,
} from '@astrolabe/rules';
import type {
  CampaignState,
  ConfigureLaunchSectorRequestBody,
  EntityId,
  EventId,
  LaunchDraftFor,
  PayloadFor,
  SaveLaunchLocationRequestBody,
} from '@astrolabe/shared';

/**
 * The Starting Sector section's form (group 8): what it opens with, how it
 * changes, and what it sends. Every transition is here rather than in the
 * `.tsx`, because groups 5, 6 and 7 each found that logic in a `.tsx` is logic
 * nothing checks.
 *
 * **One form for the whole section, because one draft holds it (8.0i).** Save
 * and continue replaces the section's snapshot, so a form that carried only
 * the part a screen edits would erase the rest on every save. Ids are the
 * server's (8.0a): a settlement being built is keyed by its `draftId`, and
 * gains a `locationId` once accepted.
 */

export const REGIONS: readonly LaunchRegion[] = ['terminus', 'outlands', 'expanse'];

export const REGION_LABELS: Readonly<Record<LaunchRegion, string>> = {
  terminus: 'Terminus',
  outlands: 'Outlands',
  expanse: 'Expanse',
};

export const REGION_DESCRIPTIONS: Readonly<Record<LaunchRegion, string>> = {
  terminus: 'The settled heart of the Forge: more settlements, more passages.',
  outlands: 'The frontier: fewer settlements, spread further apart.',
  expanse: 'The edge of the known: little settlement, few passages.',
};

/** A planet as a settlement's form holds it (8.3). */
export interface PlanetForm {
  readonly locationId?: EntityId;
  readonly planetClass: PlanetClass | '';
  readonly name: string;
  readonly atmosphere: string;
  readonly observedFromSpace: string;
  readonly feature: string;
  readonly rolls: readonly EventId[];
}

/** One settlement being built or revised (8.2). */
export interface SettlementForm {
  readonly draftId: string;
  readonly locationId?: EntityId;
  readonly name: string;
  readonly location: 'planetside' | 'orbital' | 'deep_space' | '';
  readonly population: string;
  readonly authority: string;
  readonly projects: readonly string[];
  readonly planet?: PlanetForm;
  readonly firstLooks: readonly string[];
  readonly trouble: string;
  /** Rolls the player made and kept, and ones carried from an accepted fact (A41). */
  readonly rolls: readonly EventId[];
  /** The Guide proposal these words came from, while they are still the Guide's. */
  readonly proposalEventId?: EventId;
  /** The key that proposal was made under (D-196): the draft's key or the settlement's id. */
  readonly proposalTargetId?: string;
}

/** A known non-settlement location, such as Kessel Drift (8.2). */
export interface OtherLocationForm {
  readonly draftId: string;
  readonly locationId?: EntityId;
  readonly name: string;
  readonly description: string;
}

/** The sector's optional star (8.3, D-195). */
export interface StarForm {
  readonly locationId?: EntityId;
  readonly name: string;
  readonly description: string;
  readonly rolls: readonly EventId[];
}

export interface SectorForm {
  readonly name: string;
  readonly region: LaunchRegion | '';
  /** The rolls behind the name, kept while the name is still the rolled one (A41). */
  readonly nameRolls: readonly EventId[];
  readonly nameProposalEventId?: EventId;
  readonly star: StarForm;
  readonly settlements: readonly SettlementForm[];
  readonly others: readonly OtherLocationForm[];
}

export const EMPTY_STAR: StarForm = { name: '', description: '', rolls: [] };

export const EMPTY_SECTOR_FORM: SectorForm = {
  name: '',
  region: '',
  nameRolls: [],
  star: EMPTY_STAR,
  settlements: [],
  others: [],
};

// ---------------------------------------------------------------------------
// Opening the form (D-182)
// ---------------------------------------------------------------------------

/**
 * The section as the player left it.
 *
 * D-182's precedence applied **per object**, as it was per truth and per crew
 * member: one snapshot holds the whole sector, so accepting one settlement
 * must not discard the others' unsaved work. The draft wins for an object only
 * if it was written after that object's own acceptance.
 */
export function initialSectorForm(state: CampaignState): SectorForm {
  const launch = state.launch;
  const saved = launch.drafts.sector;
  const draft = saved?.snapshot;
  const draftSeq = saved?.seq;
  const newer = (acceptedSeq: number | undefined) =>
    draftSeq !== undefined && (acceptedSeq === undefined || draftSeq > acceptedSeq);

  const sector = launch.sector;
  const headerFromDraft = draft !== undefined && newer(sector?.seq);
  const header: Omit<SectorForm, 'star' | 'settlements' | 'others'> = headerFromDraft
    ? {
        name: draft.name ?? '',
        region: draft.region ?? '',
        nameRolls: draft.nameGroundedIn ?? [],
        ...(draft.nameProposalEventId === undefined
          ? {}
          : { nameProposalEventId: draft.nameProposalEventId }),
      }
    : {
        name: sector?.name ?? '',
        region: sector?.region ?? '',
        nameRolls: sector?.groundedIn ?? [],
      };

  const star = starOf(state, draft?.star, headerFromDraft);
  const settlements = settlementsOf(state, draft?.settlements ?? [], newer);
  const others = othersOf(state, draft?.others ?? [], newer);
  return { ...header, star, settlements, others };
}

function starOf(
  state: CampaignState,
  drafted: LaunchDraftFor<'sector'>['star'],
  fromDraft: boolean,
): StarForm {
  if (fromDraft && drafted !== undefined)
    return {
      ...(drafted.locationId === undefined ? {} : { locationId: drafted.locationId }),
      name: drafted.name ?? '',
      description: drafted.description ?? '',
      rolls: [],
    };
  const starId = state.launch.sector?.starId;
  const star = starId === undefined ? undefined : state.launch.locations[starId];
  if (star?.kind !== 'star') return EMPTY_STAR;
  return {
    locationId: star.id,
    name: star.name,
    description: star.details.description ?? '',
    rolls: [...star.groundedIn],
  };
}

type DraftSettlement = NonNullable<LaunchDraftFor<'sector'>['settlements']>[number];
type DraftOther = NonNullable<LaunchDraftFor<'sector'>['others']>[number];

function settlementsOf(
  state: CampaignState,
  drafted: readonly DraftSettlement[],
  newer: (acceptedSeq: number | undefined) => boolean,
): SettlementForm[] {
  const byLocation = new Map(
    drafted.flatMap((entry) =>
      entry.locationId === undefined ? [] : [[entry.locationId, entry] as const],
    ),
  );
  const accepted = Object.values(state.launch.locations).flatMap((location) => {
    if (location.kind !== 'settlement') return [];
    const draft = byLocation.get(location.id);
    const base = settlementFromFact(state, location.id, draft?.draftId);
    return [draft !== undefined && newer(location.seq) ? settlementFromDraft(draft, base) : base];
  });
  const inProgress = drafted
    .filter((entry) => entry.locationId === undefined)
    .map((entry) => settlementFromDraft(entry, emptySettlement(entry.draftId)));
  return [...accepted, ...inProgress].map((settlement) => withProposalKey(state, settlement));
}

/** The key a restored proposal was made under, read from the fold (D-196). */
function withProposalKey(state: CampaignState, settlement: SettlementForm): SettlementForm {
  if (settlement.proposalEventId === undefined) return settlement;
  const key = [settlement.locationId, settlement.draftId].find(
    (candidate) =>
      candidate !== undefined &&
      state.launch.proposals[candidate]?.eventId === settlement.proposalEventId,
  );
  return key === undefined ? settlement : { ...settlement, proposalTargetId: key };
}

function othersOf(
  state: CampaignState,
  drafted: readonly DraftOther[],
  newer: (acceptedSeq: number | undefined) => boolean,
): OtherLocationForm[] {
  const byLocation = new Map(
    drafted.flatMap((entry) =>
      entry.locationId === undefined ? [] : [[entry.locationId, entry] as const],
    ),
  );
  const accepted = Object.values(state.launch.locations).flatMap((location) => {
    if (location.kind !== 'other') return [];
    const draft = byLocation.get(location.id);
    const base: OtherLocationForm = {
      draftId: draft?.draftId ?? location.id,
      locationId: location.id,
      name: location.name,
      description: location.description,
    };
    return [
      draft !== undefined && newer(location.seq)
        ? { ...base, name: draft.name ?? '', description: draft.description ?? '' }
        : base,
    ];
  });
  const inProgress = drafted
    .filter((entry) => entry.locationId === undefined)
    .map((entry) => ({
      draftId: entry.draftId,
      name: entry.name ?? '',
      description: entry.description ?? '',
    }));
  return [...accepted, ...inProgress];
}

export function emptySettlement(draftId: string): SettlementForm {
  return {
    draftId,
    name: '',
    location: '',
    population: '',
    authority: '',
    projects: [''],
    firstLooks: [],
    trouble: '',
    rolls: [],
  };
}

/** An accepted settlement, its planet and its trouble, read field by field. */
function settlementFromFact(
  state: CampaignState,
  locationId: EntityId,
  draftId: string | undefined,
): SettlementForm {
  const launch = state.launch;
  const location = launch.locations[locationId];
  if (location?.kind !== 'settlement') return emptySettlement(draftId ?? locationId);
  const planet = location.planetId === undefined ? undefined : launch.locations[location.planetId];
  const trouble = Object.values(launch.troubles).find(
    (candidate) => candidate.kind === 'settlement' && candidate.ownerId === locationId,
  );
  return {
    draftId: draftId ?? locationId,
    locationId,
    name: location.name,
    location: location.location,
    population: location.population,
    authority: location.authority,
    projects: [...location.projects],
    ...(planet?.kind === 'planet'
      ? {
          planet: {
            locationId: planet.id,
            planetClass: planet.planetClass,
            name: planet.name,
            atmosphere: planet.details.atmosphere ?? '',
            observedFromSpace: planet.details.observedFromSpace ?? '',
            feature: planet.details.feature ?? '',
            rolls: [...planet.groundedIn],
          },
        }
      : {}),
    firstLooks: [...(location.firstLooks ?? [])],
    trouble: trouble?.text ?? '',
    rolls: [...location.groundedIn],
  };
}

function settlementFromDraft(entry: DraftSettlement, base: SettlementForm): SettlementForm {
  const planet = entry.planet;
  return {
    ...base,
    draftId: entry.draftId,
    name: entry.name ?? '',
    location: entry.location ?? '',
    population: entry.population ?? '',
    authority: entry.authority ?? '',
    projects: entry.projects !== undefined && entry.projects.length > 0 ? entry.projects : [''],
    firstLooks: entry.firstLooks ?? [],
    trouble: entry.trouble ?? '',
    rolls: entry.groundedIn ?? base.rolls,
    ...(planet === undefined
      ? {}
      : {
          planet: {
            ...(planet.locationId === undefined ? {} : { locationId: planet.locationId }),
            planetClass: planet.planetClass ?? '',
            name: planet.name ?? '',
            atmosphere: planet.atmosphere ?? '',
            observedFromSpace: planet.observedFromSpace ?? '',
            feature: planet.feature ?? '',
            rolls: base.planet?.rolls ?? [],
          },
        }),
    ...(entry.proposalEventId === undefined ? {} : { proposalEventId: entry.proposalEventId }),
  };
}

// ---------------------------------------------------------------------------
// The region and the name (8.1)
// ---------------------------------------------------------------------------

/**
 * What the region asks of the sector (A31, D-180): read from the rules, with
 * the rules' citation, so the screen and readiness state one baseline.
 */
export function baselineOf(region: LaunchRegion) {
  return REGION_BASELINES[region];
}

export function setRegion(form: SectorForm, region: LaunchRegion): SectorForm {
  return { ...form, region };
}

/** Typing over a rolled or proposed name keeps its grounding only while the words match. */
export function setName(form: SectorForm, name: string): SectorForm {
  return { ...form, name };
}

/**
 * The sector-name recipe's two rolls land (8.0c): prefix and suffix, read
 * together, and both kept as the name's grounding (A41).
 */
export function applyNameRoll(
  form: SectorForm,
  rolls: readonly { readonly slot: string; readonly eventId: EventId; readonly text: string }[],
): SectorForm {
  const part = (slot: string) => rolls.find((roll) => roll.slot === slot)?.text.trim() ?? '';
  const name = [part('prefix'), part('suffix')].filter((word) => word !== '').join(' ');
  const { nameProposalEventId: _dropped, ...rest } = form;
  return { ...rest, name, nameRolls: rolls.map((roll) => roll.eventId) };
}

/** Problems the header has, before the server is asked (the command refuses a blank name). */
export function headerProblems(
  form: SectorForm,
): readonly { readonly path: string; readonly message: string }[] {
  return [
    ...(form.region === ''
      ? [{ path: 'sector.region', message: 'Choose the sector’s region.' }]
      : []),
    ...(form.name.trim() === ''
      ? [{ path: 'sector.name', message: 'Give the sector a name.' }]
      : []),
  ];
}

export type ConfigureSectorBody = Omit<ConfigureLaunchSectorRequestBody, 'commandId'>;

/**
 * The body of the accepting command, or `null` while it would be refused.
 * The id and baseline are the server's (8.0a); the star is named only once it
 * is an accepted location (D-195).
 */
export function toConfigureRequest(form: SectorForm): ConfigureSectorBody | null {
  if (headerProblems(form).length > 0 || form.region === '') return null;
  return {
    sector: {
      name: form.name.trim(),
      region: form.region,
      ...(form.star.locationId === undefined ? {} : { starId: form.star.locationId }),
    },
    ...(form.nameProposalEventId === undefined
      ? {}
      : { proposalEventId: form.nameProposalEventId }),
    ...(form.nameRolls.length > 0 ? { groundedIn: [...form.nameRolls] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Save and continue (8.0i)
// ---------------------------------------------------------------------------

/** The body of **Save and continue**: the whole section, durable and not canon. */
export function toDraftSnapshot(form: SectorForm): LaunchDraftFor<'sector'> {
  return {
    name: form.name,
    ...(form.region === '' ? {} : { region: form.region }),
    ...(form.nameRolls.length > 0 ? { nameGroundedIn: [...form.nameRolls] } : {}),
    ...(form.nameProposalEventId === undefined
      ? {}
      : { nameProposalEventId: form.nameProposalEventId }),
    star: {
      ...(form.star.locationId === undefined ? {} : { locationId: form.star.locationId }),
      name: form.star.name,
      description: form.star.description,
    },
    settlements: form.settlements.map((settlement) => ({
      draftId: settlement.draftId,
      ...(settlement.locationId === undefined ? {} : { locationId: settlement.locationId }),
      name: settlement.name,
      ...(settlement.location === '' ? {} : { location: settlement.location }),
      population: settlement.population,
      authority: settlement.authority,
      projects: [...settlement.projects],
      ...(settlement.planet === undefined
        ? {}
        : {
            planet: {
              ...(settlement.planet.locationId === undefined
                ? {}
                : { locationId: settlement.planet.locationId }),
              ...(settlement.planet.planetClass === ''
                ? {}
                : { planetClass: settlement.planet.planetClass }),
              name: settlement.planet.name,
              atmosphere: settlement.planet.atmosphere,
              observedFromSpace: settlement.planet.observedFromSpace,
              feature: settlement.planet.feature,
            },
          }),
      firstLooks: [...settlement.firstLooks],
      trouble: settlement.trouble,
      ...(settlement.rolls.length > 0 ? { groundedIn: [...settlement.rolls] } : {}),
      ...(settlement.proposalEventId === undefined
        ? {}
        : { proposalEventId: settlement.proposalEventId }),
    })),
    others: form.others.map((other) => ({
      draftId: other.draftId,
      ...(other.locationId === undefined ? {} : { locationId: other.locationId }),
      name: other.name,
      description: other.description,
    })),
  };
}

/** Whether the header differs from what the form opened with. */
export function isHeaderDirty(form: SectorForm, baseline: SectorForm): boolean {
  return form.name !== baseline.name || form.region !== baseline.region;
}

/** The server's sector blockers, which are what completes the section (D-176). */
export function sectorBlockers(readiness: LaunchReadiness) {
  return readiness.sections.sector.blockers;
}

// ---------------------------------------------------------------------------
// Settlements and other locations (8.2)
// ---------------------------------------------------------------------------

export type SettlementTextField = 'name' | 'population' | 'authority';
export type SettlementRollField = SettlementTextField | 'location' | 'project_1' | 'project_2';

export const SETTLEMENT_FIELD_LABELS: Readonly<Record<SettlementRollField, string>> = {
  name: 'Name',
  location: 'Location',
  population: 'Population',
  authority: 'Authority',
  project_1: 'First project',
  project_2: 'Second project',
};

export const LOCATION_LABELS: Readonly<Record<'planetside' | 'orbital' | 'deep_space', string>> = {
  planetside: 'Planetside',
  orbital: 'Orbital',
  deep_space: 'Deep space',
};

/**
 * The oracle behind each rollable settlement field, read from the declared
 * settlement recipe for the sector's region, so a field Roll can reach only a
 * table the rules put in it (3R.5c). Population is the region's own table.
 */
export function settlementFieldOracle(region: LaunchRegion, field: SettlementRollField): OracleId {
  const found = buildSettlementRecipe(region, 2).rolls.find((roll) => roll.slot === field);
  if (found === undefined) throw new Error(`The settlement recipe declares no "${field}" slot.`);
  return found.oracle;
}

const replaceSettlement = (
  form: SectorForm,
  draftId: string,
  change: (settlement: SettlementForm) => SettlementForm,
): SectorForm => ({
  ...form,
  settlements: form.settlements.map((settlement) =>
    settlement.draftId === draftId ? change(settlement) : settlement,
  ),
});

export function findSettlement(form: SectorForm, draftId: string): SettlementForm | undefined {
  return form.settlements.find((settlement) => settlement.draftId === draftId);
}

export function addSettlement(form: SectorForm, draftId: string): SectorForm {
  return { ...form, settlements: [...form.settlements, emptySettlement(draftId)] };
}

/** Forget a settlement that was never accepted. An accepted one is removed by command (8.0g). */
export function discardSettlement(form: SectorForm, draftId: string): SectorForm {
  return {
    ...form,
    settlements: form.settlements.filter(
      (settlement) => settlement.draftId !== draftId || settlement.locationId !== undefined,
    ),
  };
}

export function setSettlementText(
  form: SectorForm,
  draftId: string,
  field: SettlementTextField,
  text: string,
): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => ({ ...settlement, [field]: text }));
}

/**
 * Where the settlement is. A deep-space settlement has no world (8.0b), so
 * choosing deep space drops the planet; choosing planetside or orbital starts
 * one, because readiness will ask for it (D-174).
 */
export function setSettlementLocation(
  form: SectorForm,
  draftId: string,
  location: 'planetside' | 'orbital' | 'deep_space',
): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => {
    if (location === 'deep_space') {
      const { planet: _dropped, ...rest } = settlement;
      return { ...rest, location };
    }
    return { ...settlement, location, planet: settlement.planet ?? emptyPlanet() };
  });
}

export function emptyPlanet(): PlanetForm {
  return {
    planetClass: '',
    name: '',
    atmosphere: '',
    observedFromSpace: '',
    feature: '',
    rolls: [],
  };
}

export function setProject(
  form: SectorForm,
  draftId: string,
  index: number,
  text: string,
): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => ({
    ...settlement,
    projects: settlement.projects.map((project, i) => (i === index ? text : project)),
  }));
}

/** One or two projects (A32). */
export function setProjectCount(form: SectorForm, draftId: string, count: 1 | 2): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => ({
    ...settlement,
    projects:
      count === 2
        ? [settlement.projects[0] ?? '', settlement.projects[1] ?? '']
        : [settlement.projects[0] ?? ''],
  }));
}

/** A one-field roll lands: the row becomes the field's words, and the roll its citation. */
export function applySettlementFieldRoll(
  form: SectorForm,
  draftId: string,
  field: SettlementRollField,
  roll: { readonly eventId: EventId; readonly text: string },
): SectorForm {
  const words = withoutLinks(roll.text).trim();
  let next: SectorForm;
  if (field === 'location') {
    const location = settlementLocationFromRow(words);
    next = location === undefined ? form : setSettlementLocation(form, draftId, location);
  } else if (field === 'project_1' || field === 'project_2') {
    const index = field === 'project_1' ? 0 : 1;
    const widened = index === 1 ? setProjectCount(form, draftId, 2) : form;
    next = setProject(widened, draftId, index, words);
  } else {
    next = setSettlementText(form, draftId, field, words);
  }
  return replaceSettlement(next, draftId, (settlement) => ({
    ...settlement,
    rolls: [...new Set([...settlement.rolls, roll.eventId])],
  }));
}

/**
 * The whole settlement recipe lands (8.0c): every field from its slot, and
 * every roll kept as grounding. A proposal the player was working from no
 * longer describes these words, so its link goes.
 */
export function applySettlementRecipe(
  form: SectorForm,
  draftId: string,
  results: readonly { readonly slot: string; readonly eventId: EventId; readonly text: string }[],
): SectorForm {
  const projects = results.filter((result) => result.slot.startsWith('project_')).length;
  let next = setProjectCount(form, draftId, projects >= 2 ? 2 : 1);
  for (const result of results)
    if (isSettlementRollField(result.slot))
      next = applySettlementFieldRoll(next, draftId, result.slot, result);
  return replaceSettlement(next, draftId, (settlement) => {
    const { proposalEventId: _dropped, proposalTargetId: _target, ...rest } = settlement;
    return rest;
  });
}

function isSettlementRollField(slot: string): slot is SettlementRollField {
  return slot in SETTLEMENT_FIELD_LABELS;
}

export type SettlementProposal = Extract<
  PayloadFor<'creation.proposed'>,
  { readonly targetKind: 'settlement' }
>['proposal'];

export interface HeldSettlementProposal {
  readonly eventId: EventId;
  /** The key it was made under: the draft's key, or the accepted settlement's id (D-196). */
  readonly targetId: string;
  readonly proposal: SettlementProposal;
  readonly rationale: string;
}

/**
 * The Guide's latest proposal for this settlement, from the fold, so it
 * survives a reload. Looked for under both keys a settlement can have: its
 * `draftId` while being built, and its `locationId` once accepted (D-196).
 */
export function heldSettlementProposal(
  state: CampaignState,
  settlement: Pick<SettlementForm, 'draftId' | 'locationId'>,
): HeldSettlementProposal | null {
  for (const key of [settlement.locationId, settlement.draftId]) {
    if (key === undefined) continue;
    const held = state.launch.proposals[key];
    if (held?.targetKind === 'settlement')
      return {
        eventId: held.eventId,
        targetId: key,
        proposal: held.proposal,
        rationale: held.rationale,
      };
  }
  return null;
}

export type ProposedSettlementField =
  'name' | 'location' | 'population' | 'authority' | 'projects' | 'planet' | 'firstLooks';

export const PROPOSED_FIELD_LABELS: Readonly<Record<ProposedSettlementField, string>> = {
  name: 'Name',
  location: 'Location',
  population: 'Population',
  authority: 'Authority',
  projects: 'Projects',
  planet: 'Planet',
  firstLooks: 'First looks',
};

/** The fields a proposal offers, in form order. */
export function proposedSettlementFields(
  proposal: SettlementProposal,
): readonly ProposedSettlementField[] {
  return [
    'name',
    'location',
    'population',
    'authority',
    'projects',
    ...(proposal.planet === undefined ? [] : (['planet'] as const)),
    ...(proposal.firstLooks === undefined ? [] : (['firstLooks'] as const)),
  ];
}

/** A proposed field as words, one line per value. */
export function proposedSettlementValue(
  proposal: SettlementProposal,
  field: ProposedSettlementField,
): readonly string[] {
  switch (field) {
    case 'location':
      return [LOCATION_LABELS[proposal.location.value]];
    case 'projects':
      return proposal.projects.map((project) => project.value);
    case 'planet':
      return proposal.planet === undefined
        ? []
        : [`${proposal.planet.name.value}, a ${proposal.planet.planetClass.value} world`];
    case 'firstLooks':
      return (proposal.firstLooks ?? []).map((look) => look.value);
    default:
      return [proposal[field].value];
  }
}

export function proposedSettlementReasons(
  proposal: SettlementProposal,
  field: ProposedSettlementField,
): readonly string[] {
  switch (field) {
    case 'projects':
      return proposal.projects.map((project) => project.reason);
    case 'planet':
      return proposal.planet === undefined
        ? []
        : [proposal.planet.planetClass.reason, proposal.planet.name.reason];
    case 'firstLooks':
      return (proposal.firstLooks ?? []).map((look) => look.reason);
    default:
      return [proposal[field].reason];
  }
}

/** The rolls a proposed field cites (A41). */
export function proposedSettlementGrounding(
  proposal: SettlementProposal,
  field: ProposedSettlementField,
): readonly EventId[] {
  switch (field) {
    case 'projects':
      return proposal.projects.flatMap((project) => project.groundedIn);
    case 'planet':
      return proposal.planet === undefined
        ? []
        : [...proposal.planet.planetClass.groundedIn, ...proposal.planet.name.groundedIn];
    case 'firstLooks':
      return (proposal.firstLooks ?? []).flatMap((look) => look.groundedIn);
    default:
      return proposal[field].groundedIn;
  }
}

/**
 * Take some or all of a proposal's fields. The proposal's id and key come
 * with them, so acceptance names it and the server decides whether it was
 * edited (8.0f). A planet taken this way keeps any detail the player already
 * wrote for it.
 */
export function takeSettlementProposal(
  form: SectorForm,
  draftId: string,
  held: HeldSettlementProposal,
  fields: readonly ProposedSettlementField[] = proposedSettlementFields(held.proposal),
): SectorForm {
  const proposal = held.proposal;
  let next = replaceSettlement(form, draftId, (settlement) => ({
    ...settlement,
    proposalEventId: held.eventId,
    proposalTargetId: held.targetId,
  }));
  for (const field of fields) {
    if (field === 'location') next = setSettlementLocation(next, draftId, proposal.location.value);
    else if (field === 'projects') {
      next = setProjectCount(next, draftId, proposal.projects.length >= 2 ? 2 : 1);
      proposal.projects.forEach((project, index) => {
        next = setProject(next, draftId, index, project.value);
      });
    } else if (field === 'planet' && proposal.planet !== undefined) {
      const planet = proposal.planet;
      next = replaceSettlement(next, draftId, (settlement) => ({
        ...settlement,
        planet: {
          ...(settlement.planet ?? emptyPlanet()),
          planetClass: planet.planetClass.value,
          name: planet.name.value,
        },
      }));
    } else if (field === 'firstLooks' && proposal.firstLooks !== undefined) {
      const looks = proposal.firstLooks.map((look) => look.value);
      next = replaceSettlement(next, draftId, (settlement) => ({
        ...settlement,
        firstLooks: looks,
      }));
    } else if (field === 'name' || field === 'population' || field === 'authority') {
      next = setSettlementText(next, draftId, field, proposal[field].value);
    }
  }
  return next;
}

/** Stop working from the proposal: the words stay, the link to it goes. */
export function dropSettlementProposal(form: SectorForm, draftId: string): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => {
    const { proposalEventId: _dropped, proposalTargetId: _target, ...rest } = settlement;
    return rest;
  });
}

/**
 * What the settlement still lacks before the command would take it (A32), in
 * words, keyed by the path the server's blockers use. A planet is not
 * required here: the command accepts a planetside settlement without one, and
 * readiness says so beside the field (D-176).
 */
export function settlementProblems(
  settlement: SettlementForm,
): readonly { readonly path: string; readonly message: string }[] {
  const at = (field: string) => `sector.settlements.${settlement.draftId}.${field}`;
  const blank = (text: string) => text.trim() === '';
  return [
    ...(blank(settlement.name) ? [{ path: at('name'), message: 'Name the settlement.' }] : []),
    ...(settlement.location === ''
      ? [{ path: at('location'), message: 'Say where the settlement is.' }]
      : []),
    ...(blank(settlement.population)
      ? [{ path: at('population'), message: 'Give the settlement a population.' }]
      : []),
    ...(blank(settlement.authority)
      ? [{ path: at('authority'), message: 'Say who holds authority there.' }]
      : []),
    ...(settlement.projects.some(blank)
      ? [{ path: at('projects'), message: 'Each project needs words, or drop the second.' }]
      : []),
    ...(settlement.planet !== undefined &&
    settlement.planet.name.trim() !== '' &&
    settlement.planet.planetClass === ''
      ? [{ path: at('planet'), message: 'Choose the planet’s class, or roll it.' }]
      : []),
  ];
}

export type SettlementRequestBody = Omit<SaveLaunchLocationRequestBody, 'commandId'>;

/**
 * The body of the accepting command, or `null` while it would be refused. A
 * planet travels with its settlement, one decision in one command (8.0f); a
 * planet with no name yet is left for later rather than sent half-made.
 */
export function toSettlementRequest(settlement: SettlementForm): SettlementRequestBody | null {
  if (settlementProblems(settlement).length > 0 || settlement.location === '') return null;
  const planet = settlement.planet;
  const withPlanet =
    planet !== undefined &&
    settlement.location !== 'deep_space' &&
    planet.planetClass !== '' &&
    planet.name.trim() !== '';
  const details = {
    ...(planet?.atmosphere.trim() ? { atmosphere: planet.atmosphere.trim() } : {}),
    ...(planet?.observedFromSpace.trim()
      ? { observedFromSpace: planet.observedFromSpace.trim() }
      : {}),
    ...(planet?.feature.trim() ? { feature: planet.feature.trim() } : {}),
  };
  const looks = settlement.firstLooks.map((look) => look.trim()).filter((look) => look !== '');
  return {
    ...(settlement.locationId === undefined ? {} : { locationId: settlement.locationId }),
    location: {
      kind: 'settlement',
      name: settlement.name.trim(),
      location: settlement.location,
      population: settlement.population.trim(),
      authority: settlement.authority.trim(),
      projects: settlement.projects.map((project) => project.trim()),
      ...(looks.length > 0 ? { firstLooks: looks.slice(0, 2) } : {}),
    },
    ...(withPlanet
      ? {
          planet: {
            ...(planet.locationId === undefined ? {} : { locationId: planet.locationId }),
            details: {
              kind: 'planet' as const,
              name: planet.name.trim(),
              planetClass: planet.planetClass as PlanetClass,
              details,
            },
            ...(planet.rolls.length > 0 ? { groundedIn: [...planet.rolls] } : {}),
          },
        }
      : {}),
    ...(settlement.proposalEventId === undefined
      ? {}
      : {
          proposalEventId: settlement.proposalEventId,
          proposalTargetId: settlement.proposalTargetId ?? settlement.draftId,
        }),
    ...(settlement.rolls.length > 0 ? { groundedIn: [...settlement.rolls] } : {}),
  };
}

/** The server's ids come back into the form, so a second Accept revises rather than duplicates. */
export function markSettlementAccepted(
  form: SectorForm,
  draftId: string,
  locationId: EntityId,
  planetId?: EntityId,
): SectorForm {
  return replaceSettlement(form, draftId, (settlement) => ({
    ...settlement,
    locationId,
    ...(settlement.planet !== undefined && planetId !== undefined
      ? { planet: { ...settlement.planet, locationId: planetId } }
      : {}),
  }));
}

/** Forget a settlement the server has removed. */
export function forgetSettlement(form: SectorForm, draftId: string): SectorForm {
  return {
    ...form,
    settlements: form.settlements.filter((settlement) => settlement.draftId !== draftId),
  };
}

const replaceOther = (
  form: SectorForm,
  draftId: string,
  change: (other: OtherLocationForm) => OtherLocationForm,
): SectorForm => ({
  ...form,
  others: form.others.map((other) => (other.draftId === draftId ? change(other) : other)),
});

export function addOther(form: SectorForm, draftId: string): SectorForm {
  return { ...form, others: [...form.others, { draftId, name: '', description: '' }] };
}

export function setOther(
  form: SectorForm,
  draftId: string,
  field: 'name' | 'description',
  text: string,
): SectorForm {
  return replaceOther(form, draftId, (other) => ({ ...other, [field]: text }));
}

export function toOtherRequest(other: OtherLocationForm): SettlementRequestBody | null {
  if (other.name.trim() === '' || other.description.trim() === '') return null;
  return {
    ...(other.locationId === undefined ? {} : { locationId: other.locationId }),
    location: { kind: 'other', name: other.name.trim(), description: other.description.trim() },
  };
}

export function markOtherAccepted(
  form: SectorForm,
  draftId: string,
  locationId: EntityId,
): SectorForm {
  return replaceOther(form, draftId, (other) => ({ ...other, locationId }));
}

export function forgetOther(form: SectorForm, draftId: string): SectorForm {
  return { ...form, others: form.others.filter((other) => other.draftId !== draftId) };
}

/** "2 of 3 settlements": accepted ones against the region's floor (A31). */
export function settlementProgress(
  state: CampaignState,
  region: LaunchRegion | '',
): { readonly accepted: number; readonly required: number | undefined } {
  const accepted = Object.values(state.launch.locations).filter(
    (location) => location.kind === 'settlement',
  ).length;
  return {
    accepted,
    required: region === '' ? undefined : REGION_BASELINES[region].settlements,
  };
}
