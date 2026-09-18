import {
  CHARACTER_CREATION,
  STARFORGED,
  validateLaunchCharacterDraft,
  type AssetId,
  type ChallengeRank,
  type CharacterId,
  type CreationSlot,
  type LaunchCharacterProblem,
  type StatId,
} from '@astrolabe/rules';
import type { CampaignState, CharacterState, LaunchDraftFor } from '@astrolabe/shared';

import { assignStat, emptyDraft } from '../characters/creation-form.js';

/**
 * The Crew section's form: its steps, its transitions, and what it sends.
 *
 * Everything that changes a crew member lives here rather than in the
 * component, because group 5 learned the hard way that logic in a `.tsx` is
 * logic nothing checks: a browser pass that found four real defects
 * structurally could not reach two more, both of which threw away the player's
 * own words. Crew has more transitions than Truths did — a stat swap, a slot
 * selection, a backstory mode, hooks, a vow — so each one is a function with a
 * test rather than a handler.
 *
 * Two shapes travel in opposite directions, as in `foundation-form.ts`:
 * `toDraftSnapshot` produces what `PUT /launch/drafts` accepts, while
 * `initialCrewForm` reads a `SavedDraft` — the snapshot *and* its `seq` — back
 * alongside the accepted characters.
 */

export const CREW_STEPS = ['identity', 'stats', 'assets', 'background', 'review'] as const;
export type CrewStep = (typeof CREW_STEPS)[number];

export const STEP_LABELS: Readonly<Record<CrewStep, string>> = {
  identity: 'Identity',
  stats: 'Stats',
  assets: 'Assets',
  background: 'Background',
  review: 'Review',
};

/** The slots in `CHARACTER_CREATION`, so the component never reaches into the rules constant. */
export const CREW_SLOTS: readonly CreationSlot[] = CHARACTER_CREATION.slots;

/** Which step a validation problem belongs to, so the flow can point at it. */
const STEP_OF_FIELD: Readonly<Record<LaunchCharacterProblem['field'], CrewStep>> = {
  name: 'identity',
  callsign: 'identity',
  stats: 'stats',
  assets: 'assets',
  appearance: 'background',
  backstory: 'background',
  backgroundVow: 'background',
};

export interface CrewMemberForm {
  /** Minted by the client, stable across saves (6.0e). */
  readonly draftId: string;
  /** Set once this member is an accepted character, so a save revises it. */
  readonly characterId?: CharacterId;
  readonly name: string;
  readonly callsign: string;
  /** D-131: blank means not recorded. Never guessed. */
  readonly pronouns: string;
  readonly stats: Readonly<Record<StatId, number>>;
  readonly slotSelections: Readonly<Record<string, AssetId | undefined>>;
  readonly hooks: readonly string[];
  readonly appearance: string;
  readonly backstoryMode: 'written' | 'discover_in_play';
  /**
   * Kept even while the mode is `discover_in_play`, so switching back returns
   * the player's own words. Group 5's lesson, applied before it can bite here.
   */
  readonly backstoryText: string;
  readonly vowTitle: string;
  readonly vowRank: ChallengeRank;
  readonly signatureGear: string;
}

export function emptyCrewMember(draftId: string): CrewMemberForm {
  return {
    draftId,
    name: '',
    callsign: '',
    pronouns: '',
    stats: emptyDraft().stats,
    slotSelections: {},
    hooks: [],
    appearance: '',
    backstoryMode: 'written',
    backstoryText: '',
    vowTitle: '',
    vowRank: 'troublesome',
    signatureGear: '',
  };
}

/**
 * The crew as the form opens on it: every accepted character, plus every
 * member still only in the draft.
 *
 * D-182's precedence applied **per member**, which is the case that decision
 * names: one snapshot holds the whole crew, so accepting one character must
 * not discard in-progress edits to the others. A draft member that names a
 * character wins only if the draft was written after that character's own
 * acceptance; comparing the section as a whole would let one accepted crew
 * member bury four neighbours' unsaved work.
 */
export function initialCrewForm(state: CampaignState): readonly CrewMemberForm[] {
  const saved = state.launch.drafts.crew;
  const draftSeq = saved?.seq;
  const draftMembers = saved?.snapshot.characters ?? [];
  const byCharacterId = new Map(
    draftMembers.flatMap((member) =>
      member.characterId === undefined ? [] : [[member.characterId, member] as const],
    ),
  );

  const accepted = Object.values(state.characters).map((character) => {
    const draft = byCharacterId.get(character.id);
    const draftIsNewer = draft !== undefined && draftSeq !== undefined && draftSeq > character.seq;
    return draftIsNewer
      ? fromDraft(draft, fromCharacter(character))
      : fromCharacter(character, draft?.draftId);
  });

  // Members the draft holds and no character answers to: work in progress.
  const inProgress = draftMembers
    .filter((member) => member.characterId === undefined)
    .map((member) => fromDraft(member, emptyCrewMember(member.draftId)));

  return [...accepted, ...inProgress];
}

function fromCharacter(character: CharacterState, draftId?: string): CrewMemberForm {
  const base = emptyCrewMember(draftId ?? character.id);
  return {
    ...base,
    characterId: character.id,
    name: character.name,
    callsign: character.callsign,
    pronouns: character.pronouns ?? '',
    stats: character.stats,
    slotSelections: slotSelectionsOf(character.assets),
    hooks: character.hooks,
    appearance: character.appearance ?? '',
    backstoryMode: character.backstory?.kind ?? 'written',
    backstoryText:
      character.backstory?.kind === 'written' ? character.backstory.text : base.backstoryText,
    vowTitle: character.backgroundVow?.title ?? '',
    vowRank: character.backgroundVow?.rank ?? base.vowRank,
    signatureGear: character.signatureGear ?? '',
  };
}

type DraftMember = LaunchDraftFor<'crew'>['characters'][number];

/**
 * Read field by field, never by spreading, the way `foundation-form.ts` does
 * it: a draft member is a loose partial and an accepted character carries
 * `seq`, `provenance` and `eventId`, none of which is form state.
 */
function fromDraft(member: DraftMember, base: CrewMemberForm): CrewMemberForm {
  return {
    ...base,
    draftId: member.draftId,
    ...(member.characterId === undefined ? {} : { characterId: member.characterId }),
    name: member.name ?? base.name,
    callsign: member.callsign ?? base.callsign,
    pronouns: member.pronouns ?? base.pronouns,
    stats: member.stats ?? base.stats,
    slotSelections:
      member.assets === undefined ? base.slotSelections : slotSelectionsOf(member.assets),
    hooks: member.hooks ?? base.hooks,
    appearance: member.appearance ?? base.appearance,
    backstoryMode: member.backstory?.kind ?? base.backstoryMode,
    backstoryText:
      member.backstory?.kind === 'written' ? member.backstory.text : base.backstoryText,
    vowTitle: member.backgroundVow?.title ?? base.vowTitle,
    vowRank: member.backgroundVow?.rank ?? base.vowRank,
    signatureGear: member.signatureGear ?? base.signatureGear,
  };
}

/**
 * Put chosen assets back into the slots they can legally occupy.
 *
 * Never a legality decision of its own: `validateLaunchCharacterDraft` is what
 * decides whether a set is valid, and this only has to put each asset
 * somewhere the picker can show it. An asset no slot accepts — a Milestone 1
 * character's granted Starship (D-171) — is deliberately dropped, so the form
 * shows the three slots the launch rules recognise.
 */
function slotSelectionsOf(assets: readonly AssetId[]): Record<string, AssetId | undefined> {
  const byId = new Map(STARFORGED.assets.map((asset) => [asset.id, asset]));
  const selections: Record<string, AssetId | undefined> = {};
  const taken = new Set<string>();
  for (const assetId of assets) {
    const category = byId.get(assetId)?.categoryId;
    if (category === undefined) continue;
    const slot = CREW_SLOTS.find(
      (candidate) => !taken.has(candidate.id) && candidate.allows.includes(category),
    );
    if (slot === undefined) continue;
    selections[slot.id] = assetId;
    taken.add(slot.id);
  }
  return selections;
}

// ---------------------------------------------------------------------------
// Transitions. One function each, so each one is a test rather than a handler.
// ---------------------------------------------------------------------------

export function selectSlot(
  member: CrewMemberForm,
  slotId: string,
  assetId: AssetId | undefined,
): CrewMemberForm {
  return { ...member, slotSelections: { ...member.slotSelections, [slotId]: assetId } };
}

/** Swaps rather than overwrites, so every intermediate state is a legal array. */
export function setStat(member: CrewMemberForm, statId: StatId, value: number): CrewMemberForm {
  return { ...member, stats: assignStat(member.stats, statId, value) };
}

/**
 * Switch between a written backstory and discovering it in play.
 *
 * The text survives the switch. A player who writes two paragraphs, tries
 * "discover in play" and changes their mind back should find their words where
 * they left them — the same defect group 5 fixed for a typed truth answer, and
 * the reason these transitions are not inline handlers.
 */
export function setBackstoryMode(
  member: CrewMemberForm,
  mode: CrewMemberForm['backstoryMode'],
): CrewMemberForm {
  return { ...member, backstoryMode: mode };
}

export function setHook(member: CrewMemberForm, index: number, text: string): CrewMemberForm {
  const hooks = [...member.hooks];
  hooks[index] = text;
  return { ...member, hooks };
}

export function addHook(member: CrewMemberForm): CrewMemberForm {
  return member.hooks.length >= MAX_HOOKS ? member : { ...member, hooks: [...member.hooks, ''] };
}

export function removeHook(member: CrewMemberForm, index: number): CrewMemberForm {
  return { ...member, hooks: member.hooks.filter((_, at) => at !== index) };
}

export const MAX_HOOKS = 3;

export function setVow(
  member: CrewMemberForm,
  patch: { readonly title?: string; readonly rank?: ChallengeRank },
): CrewMemberForm {
  return {
    ...member,
    ...(patch.title === undefined ? {} : { vowTitle: patch.title }),
    ...(patch.rank === undefined ? {} : { vowRank: patch.rank }),
  };
}

/** Replace one member in the crew, by the key that identifies it. */
export function replaceMember(
  crew: readonly CrewMemberForm[],
  member: CrewMemberForm,
): readonly CrewMemberForm[] {
  return crew.map((candidate) => (candidate.draftId === member.draftId ? member : candidate));
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export function stepAt(step: CrewStep, offset: number): CrewStep {
  const index = CREW_STEPS.indexOf(step) + offset;
  return CREW_STEPS[Math.min(Math.max(index, 0), CREW_STEPS.length - 1)] ?? step;
}

/** The rules' own problems, grouped by the step that can fix them. */
export function problemsByStep(
  member: CrewMemberForm,
): Readonly<Record<CrewStep, readonly LaunchCharacterProblem[]>> {
  const grouped: Record<CrewStep, LaunchCharacterProblem[]> = {
    identity: [],
    stats: [],
    assets: [],
    background: [],
    review: [],
  };
  for (const problem of validateCrewMember(member)) {
    grouped[STEP_OF_FIELD[problem.field]].push(problem);
  }
  return grouped;
}

/** The launch rules, run on the client so a player sees a problem as they type (D-90). */
export function validateCrewMember(member: CrewMemberForm): readonly LaunchCharacterProblem[] {
  return validateLaunchCharacterDraft(launchDraftOf(member), STARFORGED);
}

export function isCrewMemberComplete(member: CrewMemberForm): boolean {
  return validateCrewMember(member).length === 0;
}

function launchDraftOf(member: CrewMemberForm) {
  const hooks = member.hooks.map((hook) => hook.trim()).filter((hook) => hook !== '');
  const pronouns = member.pronouns.trim();
  const gear = member.signatureGear.trim();
  return {
    name: member.name.trim(),
    callsign: member.callsign.trim(),
    stats: member.stats,
    assets: chosenAssets(member),
    appearance: member.appearance.trim(),
    backstory:
      member.backstoryMode === 'written'
        ? ({ kind: 'written', text: member.backstoryText.trim() } as const)
        : ({ kind: 'discover_in_play' } as const),
    backgroundVow: { title: member.vowTitle.trim(), rank: member.vowRank },
    ...(gear === '' ? {} : { signatureGear: gear }),
    ...(hooks.length === 0 ? {} : { hooks }),
    ...(pronouns === '' ? {} : { pronouns }),
  };
}

export function chosenAssets(member: CrewMemberForm): readonly AssetId[] {
  return CREW_SLOTS.map((slot) => member.slotSelections[slot.id]).filter(
    (assetId): assetId is AssetId => assetId !== undefined,
  );
}

// ---------------------------------------------------------------------------
// What the form sends
// ---------------------------------------------------------------------------

/** **Save and continue**: the whole crew, durable and deliberately not canon. */
export function toDraftSnapshot(crew: readonly CrewMemberForm[]): LaunchDraftFor<'crew'> {
  return {
    characters: crew.map((member) => ({
      draftId: member.draftId,
      ...(member.characterId === undefined ? {} : { characterId: member.characterId }),
      name: member.name,
      callsign: member.callsign,
      pronouns: member.pronouns,
      stats: member.stats,
      assets: chosenAssets(member),
      hooks: member.hooks,
      appearance: member.appearance,
      backstory:
        member.backstoryMode === 'written'
          ? { kind: 'written' as const, text: member.backstoryText }
          : { kind: 'discover_in_play' as const },
      backgroundVow: { title: member.vowTitle, rank: member.vowRank },
      signatureGear: member.signatureGear,
    })),
  };
}

export interface CrewAcceptRequest {
  readonly draft: {
    readonly name: string;
    readonly callsign: string;
    readonly stats: Readonly<Record<StatId, number>>;
    readonly assets: readonly AssetId[];
  };
  readonly backgroundVow: { readonly title: string; readonly rank: ChallengeRank };
  readonly launch: {
    readonly appearance: string;
    readonly backstory:
      { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
    readonly signatureGear?: string;
  };
  readonly hooks?: readonly string[];
  readonly pronouns?: string;
}

/**
 * The body that accepts this member, or `null` when the rules would refuse it.
 *
 * Anticipating the refusal rather than discovering it: the server runs the
 * same pure validator, so sending a draft it rejects would turn a disabled
 * button into a 422.
 */
export function toAcceptRequest(member: CrewMemberForm): CrewAcceptRequest | null {
  if (!isCrewMemberComplete(member)) return null;
  const draft = launchDraftOf(member);
  return {
    draft: {
      name: draft.name,
      callsign: draft.callsign,
      stats: draft.stats,
      assets: draft.assets,
    },
    backgroundVow: draft.backgroundVow,
    launch: {
      appearance: draft.appearance,
      backstory: draft.backstory,
      ...(draft.signatureGear === undefined ? {} : { signatureGear: draft.signatureGear }),
    },
    ...(draft.hooks === undefined ? {} : { hooks: draft.hooks }),
    ...(draft.pronouns === undefined ? {} : { pronouns: draft.pronouns }),
  };
}

export function isDirty(
  crew: readonly CrewMemberForm[],
  baseline: readonly CrewMemberForm[],
): boolean {
  return JSON.stringify(toDraftSnapshot(crew)) !== JSON.stringify(toDraftSnapshot(baseline));
}
