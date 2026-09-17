import { DEFAULT_CAMPAIGN_SETTINGS } from '@astrolabe/shared';
import type { CampaignSettings, CampaignState, LaunchDraftFor } from '@astrolabe/shared';

/**
 * The Foundation section's form: what it opens with, and what it sends.
 *
 * Two shapes with similar names travel in opposite directions here, and
 * confusing them is the mistake this module is shaped to prevent:
 *
 * - **out**, `toDraftSnapshot` returns a bare `LaunchDraftFor<'foundation'>`,
 *   which is what `PUT /launch/drafts` accepts;
 * - **in**, a saved draft is read as `state.launch.drafts.foundation`, a
 *   `SavedDraft` — the snapshot *and* its `seq`.
 *
 * The `seq` is what makes `initialFoundationForm` honest (D-182). Nothing ever
 * clears a draft, so a form that simply preferred one would show stale words
 * beside a section the same payload reports complete. Whichever was written
 * last wins, and only the fold knows which that was.
 */

export interface FoundationForm {
  readonly premise: string;
  readonly settings: CampaignSettings;
}

export function initialFoundationForm(state: CampaignState): FoundationForm {
  const accepted = state.launch.foundation;
  const draft = state.launch.drafts.foundation?.snapshot;
  const draftSeq = state.launch.drafts.foundation?.seq;
  const draftIsNewer =
    draftSeq !== undefined && (accepted === undefined || draftSeq > accepted.seq);

  // Read field by field, never by spreading either source: an accepted fact
  // also carries `provenance`, `groundedIn`, `eventId` and `seq`, and none of
  // that is form state. The next section's form should copy this shape rather
  // than a shortcut that happens to work while the payloads are small.
  const premises = draftIsNewer
    ? [draft?.premise, accepted?.premise]
    : [accepted?.premise, draft?.premise];
  const settings = draftIsNewer
    ? [accepted?.settings, draft?.settings]
    : [draft?.settings, accepted?.settings];

  return {
    premise: premises.find((value) => value !== undefined) ?? '',
    settings: mergeSettings(
      DEFAULT_CAMPAIGN_SETTINGS,
      state.campaign?.settings,
      settings[0],
      settings[1],
    ),
  };
}

type PartialSettings = { readonly [K in keyof CampaignSettings]?: CampaignSettings[K] | undefined };

/**
 * Later sources win, but only where they actually say something.
 *
 * A plain spread would not do: a draft carries `settings` as a partial, and a
 * partial with a key explicitly set to `undefined` overwrites the default
 * underneath it with nothing. That is how a saved draft would silently blank a
 * narration setting the player never touched.
 */
function mergeSettings(
  base: CampaignSettings,
  ...sources: readonly (PartialSettings | undefined)[]
): CampaignSettings {
  let merged = base;
  for (const source of sources) {
    if (source === undefined) continue;
    for (const key of Object.keys(source) as (keyof CampaignSettings)[]) {
      const value = source[key];
      if (value !== undefined) merged = { ...merged, [key]: value };
    }
  }
  return merged;
}

/** The body of **Save and continue**: durable, and deliberately not canon. */
export function toDraftSnapshot(form: FoundationForm): LaunchDraftFor<'foundation'> {
  return { premise: form.premise, settings: form.settings };
}

/**
 * The body of the canonical command, or `null` when there is nothing to accept.
 *
 * The server refuses a blank premise with `premise_required` (D-181). Sending
 * one anyway would turn a disabled button into a 422, so the refusal is
 * anticipated here rather than discovered.
 */
export function toFoundationRequest(
  form: FoundationForm,
): { readonly premise: string; readonly settings: CampaignSettings } | null {
  const premise = form.premise.trim();
  return premise === '' ? null : { premise, settings: form.settings };
}

export function isDirty(form: FoundationForm, baseline: FoundationForm): boolean {
  return (
    form.premise !== baseline.premise ||
    (Object.keys(form.settings) as (keyof CampaignSettings)[]).some(
      (key) => form.settings[key] !== baseline.settings[key],
    )
  );
}
