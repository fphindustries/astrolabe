import {
  CHARACTER_CREATION,
  CHARACTER_RECIPE,
  STARFORGED,
  validateLaunchCharacterDraft,
  type AssetId,
  type CharacterId,
  STAT_IDS,
  type ChallengeRank,
  type CreationSlot,
  type LaunchReadiness,
  type LaunchCharacterProblem,
  type StatId,
} from '@astrolabe/rules';
import type {
  CampaignState,
  CharacterState,
  EventId,
  LaunchDraftFor,
  PayloadFor,
} from '@astrolabe/shared';

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

/**
 * The table a backstory prompt is rolled from, taken from the declared recipe
 * rather than named here (D-186, 6.0h).
 *
 * The client can point at a table only because the rules declared it for this
 * exact purpose; naming the string in the web package would be the client
 * choosing an oracle, which D-65 does not allow.
 */
export const BACKSTORY_PROMPT_ORACLE = CHARACTER_RECIPE.rolls.find(
  (slot) => slot.slot === 'backstory-1',
)!.oracle;

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
  /**
   * Backstory prompts the player rolled, with the event that rolled them.
   *
   * Inspiration, not the backstory: the player writes that in their own words,
   * the way a quest starter is shown beside a truth and never becomes the
   * answer (D-162). The event ids travel into acceptance as `groundedIn`, so
   * the accepted character cites what it was built on (A41).
   */
  readonly prompts: readonly { readonly eventId: EventId; readonly text: string }[];
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
    prompts: [],
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
 * somewhere the picker can show it. An asset no slot accepts is dropped, so
 * the form shows the three slots the launch rules recognise. (A Milestone 1
 * character's granted Starship never arrives here: the fold keeps it off
 * `assets` since 7.3, D-193.)
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

/** Record a rolled prompt as inspiration. The server rolled it; this only keeps it. */
export function addPrompt(
  member: CrewMemberForm,
  prompt: { readonly eventId: EventId; readonly text: string },
): CrewMemberForm {
  return { ...member, prompts: [...member.prompts, prompt] };
}

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

/**
 * Record that the server accepted this member, so the form stops offering to
 * create them again.
 *
 * Found in the browser: accepting wrote the character, the section went
 * `complete`, and the roster still read "not accepted" — because `crew` is
 * React state seeded once and the accepted `characterId` never came back into
 * it. The label was the visible half; the dangerous half was that pressing
 * Accept a second time would have created a *duplicate* character instead of
 * revising the first.
 *
 * Re-seeding the whole crew from the server was the other option and is wrong:
 * one snapshot holds every member, so it would discard a neighbour's unsaved
 * edits — the same reason D-182 decides precedence per member.
 */
export function markAccepted(member: CrewMemberForm, characterId: CharacterId): CrewMemberForm {
  return { ...member, characterId };
}

/** "1 problem", not "1 problems". */
export function stepBadgeLabel(count: number): string {
  return `${count} ${count === 1 ? 'problem' : 'problems'} on this step`;
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
  readonly groundedIn?: readonly EventId[];
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
    ...(member.prompts.length === 0
      ? {}
      : { groundedIn: member.prompts.map((prompt) => prompt.eventId) }),
  };
}

export function isDirty(
  crew: readonly CrewMemberForm[],
  baseline: readonly CrewMemberForm[],
): boolean {
  return JSON.stringify(toDraftSnapshot(crew)) !== JSON.stringify(toDraftSnapshot(baseline));
}

// ---------------------------------------------------------------------------
// The Guide's proposal (6.3, D-185)
// ---------------------------------------------------------------------------

/** A whole proposed crew member, as the server stored it. */
export type CrewProposal = Extract<
  PayloadFor<'creation.proposed'>,
  { readonly targetKind: 'character' }
>['proposal'];

/**
 * The fields a proposal can fill, in the order the review reads them.
 *
 * Named separately from the form's own keys because one of them — `vow` —
 * covers two form fields and `assets` covers three slots. What the player
 * keeps or edits is the field, not the storage.
 */
export const CREW_PROPOSAL_FIELDS = [
  'name',
  'callsign',
  'pronouns',
  'appearance',
  'backstory',
  'stats',
  'assets',
  'vow',
  'hooks',
  'gear',
] as const;
export type CrewProposalField = (typeof CREW_PROPOSAL_FIELDS)[number];

export const PROPOSAL_FIELD_LABELS: Readonly<Record<CrewProposalField, string>> = {
  name: 'Name',
  callsign: 'Callsign',
  pronouns: 'Pronouns',
  appearance: 'Appearance',
  backstory: 'Backstory',
  stats: 'Stats',
  assets: 'Assets',
  vow: 'Background vow',
  hooks: 'Hooks',
  gear: 'Signature gear',
};

/**
 * Which fields this proposal actually fills.
 *
 * Pronouns and gear only when the Guide offered them: D-131 keeps pronouns the
 * player's own words or nothing, so an absent field stays untouched and
 * unmarked rather than being overwritten with a blank.
 */
export function proposedFields(proposal: CrewProposal): readonly CrewProposalField[] {
  return CREW_PROPOSAL_FIELDS.filter(
    (field) =>
      (field !== 'pronouns' || proposal.pronouns !== undefined) &&
      (field !== 'gear' || proposal.signatureGear !== undefined),
  );
}

/** The Guide's one-line reason for a field, for the review to show beside it. */
export function proposalReason(proposal: CrewProposal, field: CrewProposalField): string {
  switch (field) {
    case 'name':
      return proposal.name.reason;
    case 'callsign':
      return proposal.callsign.reason;
    case 'pronouns':
      return proposal.pronouns?.reason ?? '';
    case 'appearance':
      return proposal.appearance.reason;
    case 'backstory':
      return proposal.backstory.reason;
    case 'stats':
      return proposal.stats.reason;
    case 'assets':
      return proposal.assets.map((asset) => asset.reason).join(' ');
    case 'vow':
      return proposal.backgroundVow.reason;
    case 'hooks':
      return proposal.hooks.map((hook) => hook.reason).join(' ');
    case 'gear':
      return proposal.signatureGear?.reason ?? '';
  }
}

/** The rolls a proposed field cites, for its chips (A41). */
export function proposalGrounding(
  proposal: CrewProposal,
  field: CrewProposalField,
): readonly EventId[] {
  switch (field) {
    case 'name':
      return proposal.name.groundedIn;
    case 'callsign':
      return proposal.callsign.groundedIn;
    case 'backstory':
      return proposal.backstory.groundedIn;
    case 'hooks':
      return proposal.hooks.flatMap((hook) => hook.groundedIn);
    default:
      return [];
  }
}

/**
 * Apply the named fields of a proposal to a crew member.
 *
 * A subset, always: beat 5 asks the Guide for help with hooks and a vow and
 * keeps everything else as written. Passing every proposed field is beat 3's
 * whole-object acceptance — the same function, not a second path (D-166).
 *
 * The rolls behind the proposal are recorded whichever fields are taken, so
 * the accepted character cites what it was built on even when the player kept
 * only one of the Guide's answers.
 */
export function applyProposal(
  member: CrewMemberForm,
  proposal: CrewProposal,
  fields: readonly CrewProposalField[],
  prompts: readonly { readonly eventId: EventId; readonly text: string }[] = [],
): CrewMemberForm {
  const take = new Set(fields);
  let next: CrewMemberForm = { ...member };
  if (take.has('name')) next = { ...next, name: proposal.name.value };
  if (take.has('callsign')) next = { ...next, callsign: proposal.callsign.value };
  if (take.has('pronouns') && proposal.pronouns !== undefined)
    next = { ...next, pronouns: proposal.pronouns.value };
  if (take.has('appearance')) next = { ...next, appearance: proposal.appearance.value };
  if (take.has('backstory'))
    next = {
      ...next,
      backstoryMode: proposal.backstory.value.kind,
      // The player's own words survive a proposal that discovers in play, the
      // same way they survive the radio button (`setBackstoryMode`).
      backstoryText:
        proposal.backstory.value.kind === 'written'
          ? proposal.backstory.value.text
          : next.backstoryText,
    };
  if (take.has('stats')) next = { ...next, stats: proposal.stats.value };
  if (take.has('assets'))
    next = {
      ...next,
      slotSelections: slotSelectionsOf(proposal.assets.map((asset) => asset.assetId)),
    };
  if (take.has('vow'))
    next = {
      ...next,
      vowTitle: proposal.backgroundVow.title,
      vowRank: proposal.backgroundVow.rank,
    };
  if (take.has('hooks')) next = { ...next, hooks: proposal.hooks.map((hook) => hook.text) };
  if (take.has('gear') && proposal.signatureGear !== undefined)
    next = { ...next, signatureGear: proposal.signatureGear.value };
  const known = new Set(next.prompts.map((prompt) => prompt.eventId));
  return {
    ...next,
    prompts: [...next.prompts, ...prompts.filter((prompt) => !known.has(prompt.eventId))],
  };
}

/**
 * Which applied fields the player has since changed (A41, beat 3).
 *
 * "He changes the final asset to Sensor Array. The UI marks that field as
 * player-edited and preserves the proposal's original choice and reason." So
 * this compares what is in the form against what was proposed rather than
 * tracking edits as they happen — a field edited back to the Guide's value is
 * the Guide's value again, and saying otherwise would be a claim about the
 * player's history rather than about the character.
 */
export function editedFields(
  member: CrewMemberForm,
  proposal: CrewProposal,
  applied: readonly CrewProposalField[],
): readonly CrewProposalField[] {
  const asProposed = applyProposal(member, proposal, applied);
  return applied.filter((field) => !sameField(member, asProposed, field));
}

function sameField(a: CrewMemberForm, b: CrewMemberForm, field: CrewProposalField): boolean {
  switch (field) {
    case 'name':
      return a.name === b.name;
    case 'callsign':
      return a.callsign === b.callsign;
    case 'pronouns':
      return a.pronouns === b.pronouns;
    case 'appearance':
      return a.appearance === b.appearance;
    case 'backstory':
      return (
        a.backstoryMode === b.backstoryMode &&
        (a.backstoryMode === 'discover_in_play' || a.backstoryText === b.backstoryText)
      );
    case 'stats':
      return STAT_IDS.every((statId) => a.stats[statId] === b.stats[statId]);
    case 'assets':
      return JSON.stringify(chosenAssets(a)) === JSON.stringify(chosenAssets(b));
    case 'vow':
      return a.vowTitle === b.vowTitle && a.vowRank === b.vowRank;
    case 'hooks':
      return JSON.stringify(a.hooks) === JSON.stringify(b.hooks);
    case 'gear':
      return a.signatureGear === b.signatureGear;
  }
}

// ---------------------------------------------------------------------------
// The crew overview (6.4)
// ---------------------------------------------------------------------------

/** One superseded version of a crew member, as the launch fold kept it (6.0c). */
export interface CrewHistoryEntry {
  readonly name: string;
  readonly callsign: string;
  readonly appearance?: string;
  readonly backgroundVow?: { readonly title: string; readonly rank: ChallengeRank };
  readonly provenance?: string;
}

export interface CrewOverviewRow {
  readonly draftId: string;
  readonly characterId?: CharacterId;
  readonly name: string;
  /** What the row says about this member, in words rather than by colour. */
  readonly statusText: string;
  readonly complete: boolean;
  /**
   * Whether the status came from the server or from the rules run here.
   *
   * An accepted character has a server answer and it wins (D-176). A member
   * who exists only in a draft has none — the server does not know about
   * unaccepted work — so the same pure validator the server would run is run
   * here instead. Saying which is what stops the two being confused for each
   * other later.
   */
  readonly statusFrom: 'server' | 'draft';
  readonly problems: readonly string[];
  readonly history: readonly CrewHistoryEntry[];
}

/**
 * The server's blockers for one accepted crew member.
 *
 * `validateLaunchReadiness` paths them as `characters.<id>.<field>`, so this
 * reads the id back out rather than re-running the rules — the client keeps no
 * second readiness algorithm (D-176).
 */
export function serverProblemsFor(
  readiness: LaunchReadiness,
  characterId: string,
): readonly string[] {
  return readiness.sections.crew.blockers
    .filter((blocker) => blocker.path.startsWith(`characters.${characterId}.`))
    .map((blocker) => blocker.message);
}

/**
 * The crew, as the overview reads it (6.4, A27).
 *
 * Accepted members take the server's word; unaccepted ones are checked here,
 * because there is nothing on the server to ask about work that has not been
 * accepted yet.
 */
export function crewOverview(
  crew: readonly CrewMemberForm[],
  readiness: LaunchReadiness,
  history: Readonly<Record<string, readonly CrewHistoryEntry[]>> = {},
): readonly CrewOverviewRow[] {
  return crew.map((member) => {
    const accepted = member.characterId !== undefined;
    const problems = accepted
      ? serverProblemsFor(readiness, member.characterId!)
      : validateCrewMember(member).map((problem) => problem.message);
    const complete = problems.length === 0;
    return {
      draftId: member.draftId,
      ...(member.characterId === undefined ? {} : { characterId: member.characterId }),
      name: member.name.trim() === '' ? 'Unnamed' : member.name.trim(),
      statusText: !accepted
        ? complete
          ? 'Ready to accept'
          : 'In progress'
        : complete
          ? 'Complete'
          : 'Needs attention',
      complete: complete && accepted,
      statusFrom: accepted ? 'server' : 'draft',
      problems,
      history: (member.characterId === undefined ? [] : history[member.characterId]) ?? [],
    };
  });
}

export const MIN_CREW = 1;
export const MAX_CREW = 6;

/**
 * The line beat 5 asks for, in the numbers this campaign actually has.
 *
 * "It explains that one complete character is the launch minimum; three is
 * this campaign's choice, not a global requirement."
 */
export function crewSummary(rows: readonly CrewOverviewRow[]): string {
  const complete = rows.filter((row) => row.complete).length;
  const room = MAX_CREW - rows.length;
  const minimum = `One complete character is the launch minimum; ${complete} is this campaign's choice, not a requirement.`;
  return room > 0
    ? `${minimum} There is room for ${room} more.`
    : `${minimum} This campaign is full at ${MAX_CREW}.`;
}

/** Whether another crew member can be added (A27). */
export function canAddCrew(rows: readonly CrewOverviewRow[]): boolean {
  return rows.length < MAX_CREW;
}

/** A crew member who was removed before launch, and their last version (A40). */
export interface RemovedCrewMember {
  readonly characterId: string;
  readonly name: string;
  readonly reasonKnown: boolean;
  readonly versions: readonly CrewHistoryEntry[];
}

/**
 * The crew members this campaign removed (6.4, A40, D-184).
 *
 * `crewHistory` keeps every superseded version, and a removal adds the final
 * one — so a character who is gone still has a history and nobody left to
 * attach it to. Without this the record was kept and unreadable, which is the
 * failure this whole group keeps finding, arriving in the UI rather than in the
 * fold.
 *
 * Removal is append-only (A40), so this is a record of what happened, not an
 * undo. The reason is in the log; the overview shows that there was one.
 */
export function removedCrew(
  characters: Readonly<Record<string, unknown>>,
  history: Readonly<Record<string, readonly CrewHistoryEntry[]>>,
): readonly RemovedCrewMember[] {
  return Object.entries(history)
    .filter(([characterId]) => characters[characterId] === undefined)
    .map(([characterId, versions]) => ({
      characterId,
      name: versions.at(-1)?.name ?? 'Unnamed',
      reasonKnown: true,
      versions,
    }));
}
