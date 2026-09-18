import {
  REGION_BASELINES,
  type LaunchReadiness,
  type LaunchRegion,
  type PlanetClass,
} from '@astrolabe/rules';
import type {
  CampaignState,
  ConfigureLaunchSectorRequestBody,
  EntityId,
  EventId,
  LaunchDraftFor,
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
  return [...accepted, ...inProgress];
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
